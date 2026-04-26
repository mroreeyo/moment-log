import { assertEquals } from '@std/assert';
import {
  nextLocalMidnightUtc,
  runHourlyTick,
  type HourlyTickRepository,
  type SchedulerGroup,
  type SchedulerMember,
  type SchedulerPrompt,
  type WorkerDispatchInput,
} from './hourly-tick.ts';

Deno.test('runHourlyTick: creates active-hour prompt idempotently', async () => {
  const repo = makeRepo({ groups: [group({ activeHourStart: 9, activeHourEnd: 22 })] });
  const first = await runHourlyTick(deps(repo, '2026-04-27T00:00:00.000Z'));
  const second = await runHourlyTick(deps(repo, '2026-04-27T00:00:00.000Z'));

  assertEquals(first.promptsCreated, 1);
  assertEquals(second.promptsCreated, 0);
  assertEquals(repo.promptsCreated.length, 1);
  assertEquals(repo.promptsCreated[0]?.slotStartsAt, '2026-04-27T00:00:00.000Z');
});

Deno.test('runHourlyTick: skips groups outside local active hours', async () => {
  const repo = makeRepo({ groups: [group({ activeHourStart: 9, activeHourEnd: 22 })] });
  const result = await runHourlyTick(deps(repo, '2026-04-26T23:00:00.000Z'));

  assertEquals(result.promptsCreated, 0);
  assertEquals(repo.promptsCreated.length, 0);
});

Deno.test('runHourlyTick: closes prompts into empty, single, and pending outcomes', async () => {
  const repo = makeRepo({
    prompts: [
      prompt({ id: 'p0', uploadedCount: 0 }),
      prompt({ id: 'p1', uploadedCount: 1 }),
      prompt({ id: 'p2', uploadedCount: 2 }),
    ],
  });
  const result = await runHourlyTick(deps(repo, '2026-04-27T00:00:00.000Z'));

  assertEquals(result.promptsClosed, 3);
  assertEquals(result.workersEnqueued, 1);
  assertEquals(repo.vlogs, [
    { promptId: 'p0', status: 'skipped', outcome: 'empty', clipCount: 0 },
    { promptId: 'p1', status: 'skipped', outcome: 'skipped_single', clipCount: 1 },
    { promptId: 'p2', status: 'pending', outcome: 'empty', clipCount: 2 },
  ]);
  assertEquals(repo.dispatched, [{ promptId: 'p2', groupId: 'g1', triggerType: 'hourly-tick' }]);
});

Deno.test('runHourlyTick: mutes a member after the third consecutive miss', async () => {
  const repo = makeRepo({
    groups: [group({ timezone: 'Asia/Seoul' })],
    prompts: [prompt({ id: 'p0', uploadedCount: 0 })],
    members: [{ userId: 'u1', consecutiveMissedCount: 2 }],
  });
  await runHourlyTick(deps(repo, '2026-04-27T13:00:00.000Z'));

  assertEquals(repo.memberUpdates, [
    {
      groupId: 'g1',
      userId: 'u1',
      consecutiveMissedCount: 3,
      mutedUntil: '2026-04-27T15:00:00.000Z',
    },
  ]);
});

Deno.test('nextLocalMidnightUtc handles group timezone', () => {
  assertEquals(
    nextLocalMidnightUtc(new Date('2026-04-27T13:00:00.000Z'), 'Asia/Seoul').toISOString(),
    '2026-04-27T15:00:00.000Z',
  );
});

const deps = (repo: ReturnType<typeof makeRepo>, now: string) => ({
  repo,
  worker: { dispatchCompile: (input: WorkerDispatchInput) => repo.dispatch(input) },
  clock: { now: () => new Date(now) },
});

const group = (overrides: Partial<SchedulerGroup> = {}): SchedulerGroup => ({
  id: 'g1',
  timezone: 'Asia/Seoul',
  activeHourStart: 0,
  activeHourEnd: 23,
  ...overrides,
});

const prompt = (overrides: Partial<SchedulerPrompt> = {}): SchedulerPrompt => ({
  id: 'p0',
  groupId: 'g1',
  slotStartsAt: '2026-04-26T22:00:00.000Z',
  uploadedCount: 0,
  expectedCount: 1,
  ...overrides,
});

const makeRepo = (
  input: {
    readonly groups?: readonly SchedulerGroup[];
    readonly prompts?: readonly SchedulerPrompt[];
    readonly members?: readonly SchedulerMember[];
  } = {},
) => {
  const groups = [...(input.groups ?? [group()])];
  const prompts = [...(input.prompts ?? [])];
  const promptKeys = new Set<string>();
  const repo = {
    promptsCreated: [] as Array<{
      groupId: string;
      slotStartsAt: string;
      slotEndsAt: string;
      graceEndsAt: string;
      expectedCount: number;
    }>,
    vlogs: [] as Array<{
      promptId: string;
      status: string;
      outcome: string;
      clipCount: number;
    }>,
    memberUpdates: [] as Array<{
      groupId: string;
      userId: string;
      consecutiveMissedCount: number;
      mutedUntil: string | null;
    }>,
    dispatched: [] as WorkerDispatchInput[],
    dispatch: (input: WorkerDispatchInput): Promise<boolean> => {
      repo.dispatched.push(input);
      return Promise.resolve(true);
    },
    createCronRun: (): Promise<string> => Promise.resolve('run-1'),
    completeCronRun: () => Promise.resolve(),
    failCronRun: () => Promise.resolve(),
    listGroups: (): Promise<readonly SchedulerGroup[]> => Promise.resolve(groups),
    countMembers: (): Promise<number> => Promise.resolve(input.members?.length ?? 1),
    createPromptIfMissing: (created): Promise<boolean> => {
      const key = `${created.groupId}:${created.slotStartsAt}`;
      if (promptKeys.has(key)) return Promise.resolve(false);
      promptKeys.add(key);
      repo.promptsCreated.push(created);
      return Promise.resolve(true);
    },
    listClosablePrompts: (): Promise<readonly SchedulerPrompt[]> => Promise.resolve(prompts),
    closePrompt: (): Promise<boolean> => Promise.resolve(true),
    createVlogForClosedPrompt: (created): Promise<boolean> => {
      repo.vlogs.push({
        promptId: created.promptId,
        status: created.status,
        outcome: created.outcome,
        clipCount: created.clipCount,
      });
      return Promise.resolve(true);
    },
    listMembers: (): Promise<readonly SchedulerMember[]> =>
      Promise.resolve(input.members ?? [{ userId: 'u1', consecutiveMissedCount: 0 }]),
    hasClip: (_promptId: string, userId: string): Promise<boolean> =>
      Promise.resolve(userId === 'uploaded'),
    updateMemberMissState: (update): Promise<void> => {
      repo.memberUpdates.push(update);
      return Promise.resolve();
    },
    resetExpiredMutes: () => Promise.resolve(),
    reapTimedOutProcessingVlogs: () => Promise.resolve(0),
  } satisfies HourlyTickRepository & {
    promptsCreated: unknown[];
    vlogs: unknown[];
    memberUpdates: unknown[];
    dispatched: WorkerDispatchInput[];
    dispatch: (input: WorkerDispatchInput) => Promise<boolean>;
  };
  return repo;
};
