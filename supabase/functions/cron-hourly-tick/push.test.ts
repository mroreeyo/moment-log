import { assertEquals } from '@std/assert';
import { ExpoPushDispatcher } from './push.ts';

Deno.test(
  'ExpoPushDispatcher: batches by 100, polls receipts, and invalidates only permanent token errors',
  async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const dispatcher = new ExpoPushDispatcher({
      sendUrl: 'https://expo.test/send',
      receiptsUrl: 'https://expo.test/receipts',
      receiptDelayMs: 0,
      sleeper: () => Promise.resolve(),
      fetcher: ((input, init) => {
        const url = String(input);
        const requestInit = init as { readonly body?: unknown } | undefined;
        const body = JSON.parse(String(requestInit?.body ?? '{}')) as unknown;
        calls.push({ url, body });
        if (url.endsWith('/send')) {
          const messages = body as readonly unknown[];
          return Promise.resolve(
            json({
              data: messages.map((_, index) => ({
                status: 'ok',
                id: `receipt-${calls.length}-${index}`,
              })),
            }),
          );
        }
        return Promise.resolve(
          json({
            data: {
              'receipt-1-0': { status: 'error', details: { error: 'DeviceNotRegistered' } },
              'receipt-1-1': { status: 'error', details: { error: 'MessageRateExceeded' } },
              'receipt-1-2': { status: 'ok' },
            },
          }),
        );
      }) as typeof fetch,
    });

    const result = await dispatcher.dispatchPromptCreated({
      groupId: 'g1',
      promptId: 'p1',
      groupName: '우리 그룹',
      tokens: Array.from({ length: 101 }, (_, i) => `ExponentPushToken[token-${i}]`),
    });

    assertEquals(result.attempted, 101);
    assertEquals(result.succeeded, 101);
    assertEquals(result.permanentFailedTokens, ['ExponentPushToken[token-0]']);
    assertEquals(calls.filter((call) => call.url.endsWith('/send')).length, 2);
    assertEquals((calls[0]?.body as readonly unknown[]).length, 100);
    assertEquals((calls[1]?.body as readonly unknown[]).length, 1);
  },
);

Deno.test(
  'ExpoPushDispatcher: send-ticket permanent errors are invalidated immediately',
  async () => {
    const dispatcher = new ExpoPushDispatcher({
      sendUrl: 'https://expo.test/send',
      receiptsUrl: 'https://expo.test/receipts',
      receiptDelayMs: 0,
      sleeper: () => Promise.resolve(),
      fetcher: ((input) => {
        if (String(input).endsWith('/send')) {
          return Promise.resolve(
            json({
              data: [
                { status: 'error', details: { error: 'MismatchSenderId' } },
                { status: 'error', details: { error: 'MessageRateExceeded' } },
              ],
            }),
          );
        }
        return Promise.resolve(json({ data: {} }));
      }) as typeof fetch,
    });

    const result = await dispatcher.dispatchPromptCreated({
      groupId: 'g1',
      promptId: 'p1',
      groupName: '우리 그룹',
      tokens: ['ExpoPushToken[bad]', 'ExpoPushToken[rate]'],
    });

    assertEquals(result.permanentFailedTokens, ['ExpoPushToken[bad]']);
    assertEquals(result.succeeded, 0);
  },
);

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
