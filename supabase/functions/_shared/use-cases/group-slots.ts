import { Api, Vlog } from '@momentlog/domain/index.ts';
import type { Clock } from '../ports/driven/clock.ts';

export interface GroupSlotsQueryInput {
  readonly groupId: string;
  readonly date: string;
}

export interface GroupSlotsPrompt {
  readonly id: string;
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
  readonly graceEndsAt: string;
  readonly expectedCount: number;
  readonly status: 'open' | 'closed';
}

export interface GroupSlotsVlog {
  readonly promptId: string;
  readonly status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped';
  readonly outcome: 'empty' | 'skipped_single' | 'compiled' | 'failed' | 'expired';
}

export interface GroupSlotsClip {
  readonly promptId: string;
  readonly userId: string;
  readonly rawDeleteAt: string;
}

export interface GroupSlotsGroup {
  readonly id: string;
  readonly timezone: string;
}

export interface GroupSlotsRepository {
  readonly findGroup: (groupId: string) => Promise<GroupSlotsGroup | null>;
  readonly isMember: (userId: string, groupId: string) => Promise<boolean>;
  readonly listPromptsInWindow: (input: {
    readonly groupId: string;
    readonly windowStart: string;
    readonly windowEnd: string;
  }) => Promise<readonly GroupSlotsPrompt[]>;
  readonly listVlogs: (promptIds: readonly string[]) => Promise<readonly GroupSlotsVlog[]>;
  readonly listClips: (promptIds: readonly string[]) => Promise<readonly GroupSlotsClip[]>;
}

export interface GroupSlotsDeps {
  readonly repo: GroupSlotsRepository;
  readonly clock: Clock;
}

export type GroupSlotsResult =
  | ({ readonly ok: true } & Api.GetGroupSlotsResponse)
  | { readonly ok: false; readonly error: Api.DomainError };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const listGroupSlots = async (
  deps: GroupSlotsDeps,
  input: { readonly userId: string; readonly query: GroupSlotsQueryInput },
): Promise<GroupSlotsResult> => {
  const groupId = normalize(input.query.groupId);
  const date = normalize(input.query.date);
  if (!groupId || !ISO_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return {
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields: ['groupId', 'date'] } },
    };
  }

  const group = await deps.repo.findGroup(groupId);
  if (!group) return { ok: false, error: { code: 'NOT_FOUND', resource: 'group' } };

  const member = await deps.repo.isMember(input.userId, groupId);
  if (!member) return { ok: false, error: { code: 'FORBIDDEN' } };

  const window = broadUtcWindowForLocalDate(date);
  const prompts = (await deps.repo.listPromptsInWindow({ groupId, ...window }))
    .filter((prompt) => localDate(prompt.slotStartsAt, group.timezone) === date)
    .sort((a, b) => a.slotStartsAt.localeCompare(b.slotStartsAt));
  const promptIds = prompts.map((prompt) => prompt.id);
  const [vlogs, clips] = await Promise.all([
    deps.repo.listVlogs(promptIds),
    deps.repo.listClips(promptIds),
  ]);

  const vlogsByPrompt = new Map(vlogs.map((vlog) => [vlog.promptId, vlog]));
  const clipsByPrompt = groupBy(clips, (clip) => clip.promptId);
  const now = deps.clock.now();

  return {
    ok: true,
    groupId,
    date,
    slots: prompts.map((prompt): Api.SlotSummary => {
      const promptClips = clipsByPrompt.get(prompt.id) ?? [];
      const vlog = vlogsByPrompt.get(prompt.id) ?? null;
      const rawExists = promptClips.length > 0;
      const expired = isExpired(vlog, promptClips, now);
      return {
        promptId: prompt.id,
        slotStartsAt: prompt.slotStartsAt,
        slotEndsAt: prompt.slotEndsAt,
        graceEndsAt: prompt.graceEndsAt,
        status: prompt.status,
        outcome: expired ? 'expired' : (vlog?.outcome ?? 'empty'),
        userFacingStatus: userFacingStatus(vlog, rawExists, expired),
        expired,
        clipCount: promptClips.length,
        expectedCount: prompt.expectedCount,
        myClipExists: promptClips.some((clip) => clip.userId === input.userId),
        vlogUrl: null,
        clips: [],
      };
    }),
  };
};

const userFacingStatus = (
  vlog: GroupSlotsVlog | null,
  rawExists: boolean,
  expired: boolean,
): Api.SlotSummary['userFacingStatus'] => {
  if (expired) return 'expired';
  if (!vlog) return rawExists ? 'raw_only' : 'empty';
  return Vlog.toUserFacingStatus(toVlogState(vlog), { rawExists });
};

const isExpired = (
  vlog: GroupSlotsVlog | null,
  clips: readonly GroupSlotsClip[],
  now: Date,
): boolean => {
  if (vlog?.status !== 'failed') return false;
  return clips.some((clip) => Date.parse(clip.rawDeleteAt) <= now.getTime());
};

const toVlogState = (vlog: GroupSlotsVlog): Vlog.VlogState => {
  switch (vlog.status) {
    case 'pending':
      return { status: 'pending' };
    case 'processing':
      return { status: 'processing' };
    case 'done':
      return { status: 'done', outcome: 'compiled' };
    case 'failed':
      return { status: 'failed', outcome: vlog.outcome === 'expired' ? 'expired' : 'failed' };
    case 'skipped':
      return {
        status: 'skipped',
        outcome: vlog.outcome === 'skipped_single' ? 'skipped_single' : 'empty',
      };
  }
};

const broadUtcWindowForLocalDate = (
  date: string,
): { readonly windowStart: string; readonly windowEnd: string } => {
  const dayStart = Date.parse(`${date}T00:00:00.000Z`);
  return {
    windowStart: new Date(dayStart - DAY_MS).toISOString(),
    windowEnd: new Date(dayStart + 2 * DAY_MS).toISOString(),
  };
};

const localDate = (iso: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

const normalize = (value: string): string => value.trim();

const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = map.get(key);
    if (existing) existing.push(item);
    else map.set(key, [item]);
  }
  return map;
};
