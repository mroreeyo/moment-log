import type { Clock } from '../ports/driven/clock.ts';

export interface SchedulerGroup {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly activeHourStart: number;
  readonly activeHourEnd: number;
}

export interface SchedulerPrompt {
  readonly id: string;
  readonly groupId: string;
  readonly slotStartsAt: string;
  readonly uploadedCount: number;
  readonly expectedCount: number;
}

export interface SchedulerMember {
  readonly userId: string;
  readonly consecutiveMissedCount: number;
}

export interface CronRunCounters {
  readonly promptsCreated: number;
  readonly promptsClosed: number;
  readonly pushesAttempted: number;
  readonly pushesSucceeded: number;
  readonly workersEnqueued: number;
}

export interface HourlyTickOutput extends CronRunCounters {
  readonly cronRunId: string;
}

export interface WorkerDispatchInput {
  readonly promptId: string;
  readonly groupId: string;
  readonly triggerType: 'hourly-tick';
}

export interface HourlyTickRepository {
  readonly createCronRun: (jobName: 'hourly-tick') => Promise<string>;
  readonly completeCronRun: (cronRunId: string, counters: CronRunCounters) => Promise<void>;
  readonly failCronRun: (
    cronRunId: string,
    errorMessage: string,
    counters: CronRunCounters,
  ) => Promise<void>;
  readonly listGroups: () => Promise<readonly SchedulerGroup[]>;
  readonly countMembers: (groupId: string) => Promise<number>;
  readonly createPromptIfMissing: (input: {
    readonly groupId: string;
    readonly slotStartsAt: string;
    readonly slotEndsAt: string;
    readonly graceEndsAt: string;
    readonly expectedCount: number;
  }) => Promise<string | null>;
  readonly listPushTokens: (groupId: string) => Promise<readonly string[]>;
  readonly invalidatePushTokens: (
    tokens: readonly string[],
    invalidatedAt: string,
  ) => Promise<void>;
  readonly listClosablePrompts: (now: string) => Promise<readonly SchedulerPrompt[]>;
  readonly closePrompt: (promptId: string) => Promise<boolean>;
  readonly createVlogForClosedPrompt: (input: {
    readonly promptId: string;
    readonly groupId: string;
    readonly clipCount: number;
    readonly status: 'pending' | 'skipped';
    readonly outcome: 'empty' | 'skipped_single';
    readonly triggerType: 'hourly-tick' | null;
    readonly processingStartedAt: string | null;
  }) => Promise<boolean>;
  readonly listMembers: (groupId: string) => Promise<readonly SchedulerMember[]>;
  readonly hasClip: (promptId: string, userId: string) => Promise<boolean>;
  readonly updateMemberMissState: (input: {
    readonly groupId: string;
    readonly userId: string;
    readonly consecutiveMissedCount: number;
    readonly mutedUntil: string | null;
  }) => Promise<void>;
  readonly resetExpiredMutes: (now: string) => Promise<void>;
  readonly reapTimedOutProcessingVlogs: (threshold: string) => Promise<number>;
}

export interface WorkerDispatcher {
  readonly dispatchCompile: (input: WorkerDispatchInput) => Promise<boolean>;
}

export interface PushDispatchInput {
  readonly groupId: string;
  readonly promptId: string;
  readonly groupName: string;
  readonly tokens: readonly string[];
}

export interface PushDispatchResult {
  readonly attempted: number;
  readonly succeeded: number;
  readonly permanentFailedTokens: readonly string[];
}

export interface PushDispatcher {
  readonly dispatchPromptCreated: (input: PushDispatchInput) => Promise<PushDispatchResult>;
}

export interface HourlyTickDeps {
  readonly repo: HourlyTickRepository;
  readonly worker: WorkerDispatcher;
  readonly push: PushDispatcher;
  readonly clock: Clock;
}

const SLOT_MS = 60 * 60 * 1000;
const GRACE_MS = 15 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const MISS_MUTE_THRESHOLD = 3;

export const runHourlyTick = async (deps: HourlyTickDeps): Promise<HourlyTickOutput> => {
  const counters = mutableCounters();
  const cronRunId = await deps.repo.createCronRun('hourly-tick');
  try {
    const now = deps.clock.now();
    const slotStartsAt = truncateToUtcHour(now);
    const slotEndsAt = new Date(slotStartsAt.getTime() + SLOT_MS);
    const graceEndsAt = new Date(slotEndsAt.getTime() + GRACE_MS);

    await deps.repo.resetExpiredMutes(now.toISOString());
    await deps.repo.reapTimedOutProcessingVlogs(
      new Date(now.getTime() - PROCESSING_TIMEOUT_MS).toISOString(),
    );

    const groups = await deps.repo.listGroups();
    for (const group of groups) {
      if (!isActiveLocalHour(now, group)) continue;
      const expectedCount = await deps.repo.countMembers(group.id);
      const createdPromptId = await deps.repo.createPromptIfMissing({
        groupId: group.id,
        slotStartsAt: slotStartsAt.toISOString(),
        slotEndsAt: slotEndsAt.toISOString(),
        graceEndsAt: graceEndsAt.toISOString(),
        expectedCount,
      });
      if (createdPromptId) {
        counters.promptsCreated += 1;
        const tokens = await deps.repo.listPushTokens(group.id);
        if (tokens.length > 0) {
          const pushResult = await deps.push.dispatchPromptCreated({
            groupId: group.id,
            promptId: createdPromptId,
            groupName: group.name,
            tokens,
          });
          counters.pushesAttempted += pushResult.attempted;
          counters.pushesSucceeded += pushResult.succeeded;
          await deps.repo.invalidatePushTokens(
            pushResult.permanentFailedTokens,
            deps.clock.now().toISOString(),
          );
        }
      }
    }

    const closable = await deps.repo.listClosablePrompts(now.toISOString());
    for (const prompt of closable) {
      const closed = await deps.repo.closePrompt(prompt.id);
      if (!closed) continue;
      counters.promptsClosed += 1;
      const clipCount = prompt.uploadedCount;
      const vlog = vlogStateForClipCount(clipCount);
      const processingStartedAt = vlog.status === 'pending' ? now.toISOString() : null;
      const vlogCreated = await deps.repo.createVlogForClosedPrompt({
        promptId: prompt.id,
        groupId: prompt.groupId,
        clipCount,
        status: vlog.status,
        outcome: vlog.outcome,
        triggerType: vlog.status === 'pending' ? 'hourly-tick' : null,
        processingStartedAt,
      });
      if (vlogCreated && vlog.status === 'pending') {
        const enqueued = await deps.worker.dispatchCompile({
          promptId: prompt.id,
          groupId: prompt.groupId,
          triggerType: 'hourly-tick',
        });
        if (enqueued) counters.workersEnqueued += 1;
      }
      await updateMissStreaks(deps.repo, prompt, now);
    }

    await deps.repo.completeCronRun(cronRunId, counters);
    return { cronRunId, ...counters };
  } catch (error) {
    await deps.repo.failCronRun(cronRunId, errorSummary(error), counters);
    throw error;
  }
};

const updateMissStreaks = async (
  repo: HourlyTickRepository,
  prompt: SchedulerPrompt,
  now: Date,
): Promise<void> => {
  const members = await repo.listMembers(prompt.groupId);
  for (const member of members) {
    const uploaded = await repo.hasClip(prompt.id, member.userId);
    if (uploaded) {
      await repo.updateMemberMissState({
        groupId: prompt.groupId,
        userId: member.userId,
        consecutiveMissedCount: 0,
        mutedUntil: null,
      });
      continue;
    }
    const nextCount = member.consecutiveMissedCount + 1;
    await repo.updateMemberMissState({
      groupId: prompt.groupId,
      userId: member.userId,
      consecutiveMissedCount: nextCount,
      mutedUntil:
        nextCount >= MISS_MUTE_THRESHOLD
          ? nextLocalMidnightUtc(now, await groupTimezone(repo, prompt.groupId)).toISOString()
          : null,
    });
  }
};

const groupTimezoneCache = new Map<string, string>();

const groupTimezone = async (repo: HourlyTickRepository, groupId: string): Promise<string> => {
  const cached = groupTimezoneCache.get(groupId);
  if (cached) return cached;
  const group = (await repo.listGroups()).find((candidate) => candidate.id === groupId);
  const timezone = group?.timezone ?? 'UTC';
  groupTimezoneCache.set(groupId, timezone);
  return timezone;
};

const vlogStateForClipCount = (
  clipCount: number,
): { readonly status: 'pending' | 'skipped'; readonly outcome: 'empty' | 'skipped_single' } => {
  if (clipCount === 0) return { status: 'skipped', outcome: 'empty' };
  if (clipCount === 1) return { status: 'skipped', outcome: 'skipped_single' };
  return { status: 'pending', outcome: 'empty' };
};

const truncateToUtcHour = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()),
  );

const isActiveLocalHour = (date: Date, group: SchedulerGroup): boolean => {
  const hour = localParts(date, group.timezone).hour;
  return hour >= group.activeHourStart && hour <= group.activeHourEnd;
};

export const nextLocalMidnightUtc = (date: Date, timezone: string): Date => {
  const parts = localParts(date, timezone);
  const nextLocalNoonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 12));
  const nextParts = localParts(nextLocalNoonUtc, timezone);
  return zonedTimeToUtc(nextParts.year, nextParts.month, nextParts.day, 0, timezone);
};

const zonedTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  timezone: string,
): Date => {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const parts = localParts(guess, timezone);
  const deltaMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour) - guess.getTime();
  return new Date(guess.getTime() - deltaMs);
};

const localParts = (
  date: Date,
  timezone: string,
): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
} => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
};

const mutableCounters = (): {
  promptsCreated: number;
  promptsClosed: number;
  pushesAttempted: number;
  pushesSucceeded: number;
  workersEnqueued: number;
} => ({
  promptsCreated: 0,
  promptsClosed: 0,
  pushesAttempted: 0,
  pushesSucceeded: 0,
  workersEnqueued: 0,
});

const errorSummary = (error: unknown): string =>
  error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
