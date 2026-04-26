import type {
  PushDispatchInput,
  PushDispatchResult,
  PushDispatcher,
} from '../_shared/use-cases/hourly-tick.ts';

export interface ExpoPushTicketOk {
  readonly status: 'ok';
  readonly id: string;
}

export interface ExpoPushTicketError {
  readonly status: 'error';
  readonly message?: string;
  readonly details?: { readonly error?: string };
}

export type ExpoPushTicket = ExpoPushTicketOk | ExpoPushTicketError;

export interface ExpoPushReceiptOk {
  readonly status: 'ok';
}

export interface ExpoPushReceiptError {
  readonly status: 'error';
  readonly message?: string;
  readonly details?: { readonly error?: string };
}

export type ExpoPushReceipt = ExpoPushReceiptOk | ExpoPushReceiptError;

export interface ExpoPushDispatcherOptions {
  readonly sendUrl?: string;
  readonly receiptsUrl?: string;
  readonly receiptDelayMs?: number;
  readonly fetcher?: typeof fetch;
  readonly sleeper?: (ms: number) => Promise<void>;
}

interface ExpoPushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data: {
    readonly groupId: string;
    readonly promptId: string;
    readonly route: '/camera';
  };
}

const DEFAULT_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const DEFAULT_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const DEFAULT_RECEIPT_DELAY_MS = 15_000;
const MAX_BATCH_SIZE = 100;
const PERMANENT_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'MismatchSenderId']);

export class ExpoPushDispatcher implements PushDispatcher {
  private readonly sendUrl: string;
  private readonly receiptsUrl: string;
  private readonly receiptDelayMs: number;
  private readonly fetcher: typeof fetch;
  private readonly sleeper: (ms: number) => Promise<void>;

  constructor(options: ExpoPushDispatcherOptions = {}) {
    this.sendUrl = options.sendUrl ?? Deno.env.get('EXPO_PUSH_SEND_URL') ?? DEFAULT_SEND_URL;
    this.receiptsUrl =
      options.receiptsUrl ?? Deno.env.get('EXPO_PUSH_RECEIPTS_URL') ?? DEFAULT_RECEIPTS_URL;
    this.receiptDelayMs = Number(
      options.receiptDelayMs ??
        Deno.env.get('EXPO_PUSH_RECEIPT_DELAY_MS') ??
        DEFAULT_RECEIPT_DELAY_MS,
    );
    this.fetcher = options.fetcher ?? fetch;
    this.sleeper = options.sleeper ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async dispatchPromptCreated(input: PushDispatchInput): Promise<PushDispatchResult> {
    const tokens = [...new Set(input.tokens)];
    const ticketsByReceiptId = new Map<string, string>();
    const permanentFailedTokens = new Set<string>();
    let succeeded = 0;

    for (const tokenBatch of chunks(tokens, MAX_BATCH_SIZE)) {
      const tickets = await this.sendBatch(tokenBatch.map((token) => toMessage(input, token)));
      tickets.forEach((ticket, index) => {
        const token = tokenBatch[index];
        if (!token) return;
        if (ticket.status === 'ok') {
          succeeded += 1;
          ticketsByReceiptId.set(ticket.id, token);
          return;
        }
        if (isPermanentTokenError(ticket.details?.error)) permanentFailedTokens.add(token);
      });
    }

    if (ticketsByReceiptId.size > 0) {
      await this.sleeper(this.receiptDelayMs);
      const receiptFailures = await this.fetchReceiptFailures([...ticketsByReceiptId.keys()]);
      for (const receiptId of receiptFailures) {
        const token = ticketsByReceiptId.get(receiptId);
        if (token) permanentFailedTokens.add(token);
      }
    }

    return {
      attempted: tokens.length,
      succeeded,
      permanentFailedTokens: [...permanentFailedTokens],
    };
  }

  private async sendBatch(
    messages: readonly ExpoPushMessage[],
  ): Promise<readonly ExpoPushTicket[]> {
    const response = await this.fetcher(this.sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push send failed: ${response.status}`);
    const body = (await response.json()) as { readonly data?: readonly ExpoPushTicket[] };
    return body.data ?? [];
  }

  private async fetchReceiptFailures(receiptIds: readonly string[]): Promise<readonly string[]> {
    const permanentReceiptIds: string[] = [];
    for (const idBatch of chunks(receiptIds, MAX_BATCH_SIZE)) {
      const response = await this.fetcher(this.receiptsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idBatch }),
      });
      if (!response.ok) throw new Error(`Expo push receipts failed: ${response.status}`);
      const body = (await response.json()) as {
        readonly data?: Readonly<Record<string, ExpoPushReceipt>>;
      };
      const receipts = body.data ?? {};
      for (const receiptId of idBatch) {
        const receipt = receipts[receiptId];
        if (receipt?.status === 'error' && isPermanentTokenError(receipt.details?.error)) {
          permanentReceiptIds.push(receiptId);
        }
      }
    }
    return permanentReceiptIds;
  }
}

const toMessage = (input: PushDispatchInput, token: string): ExpoPushMessage => ({
  to: token,
  title: input.groupName,
  body: '지금 3초 기록하기',
  data: { groupId: input.groupId, promptId: input.promptId, route: '/camera' },
});

const chunks = <T>(values: readonly T[], size: number): readonly T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

const isPermanentTokenError = (error: string | undefined): boolean =>
  error !== undefined && PERMANENT_TOKEN_ERRORS.has(error);
