import { assertEquals } from '@std/assert';
import { finalizeClip } from './finalize-clip.ts';
import type {
  ClipRepository,
  PromptFinalizeSnapshot,
  UpsertClipInput,
  UpsertClipResult,
} from '../ports/driven/clip.repository.ts';
import type { Clock } from '../ports/driven/clock.ts';

class FakeRepo implements ClipRepository {
  upsertCalls: UpsertClipInput[] = [];
  constructor(
    private readonly prompt: PromptFinalizeSnapshot | null,
    private readonly membership = true,
    private readonly upsertResult: UpsertClipResult = { clipId: 'c1', replaced: false },
    private readonly recalculatedPrompt: PromptFinalizeSnapshot | null | undefined = undefined,
  ) {}
  findPromptForFinalize(): Promise<PromptFinalizeSnapshot | null> {
    return Promise.resolve(this.prompt);
  }
  findPromptForRecording(): Promise<PromptFinalizeSnapshot | null> {
    return Promise.resolve(
      this.recalculatedPrompt === undefined ? this.prompt : this.recalculatedPrompt,
    );
  }
  isMember(): Promise<boolean> {
    return Promise.resolve(this.membership);
  }
  upsertClip(input: UpsertClipInput): Promise<UpsertClipResult> {
    this.upsertCalls.push(input);
    return Promise.resolve(this.upsertResult);
  }
}

class FixedClock implements Clock {
  constructor(private readonly date: Date) {}
  now(): Date {
    return this.date;
  }
}

const SNAPSHOT: PromptFinalizeSnapshot = {
  promptId: 'prompt-12',
  groupId: 'g1',
  slotStartsAt: '2026-04-24T12:00:00.000Z',
  slotEndsAt: '2026-04-24T13:00:00.000Z',
  graceEndsAt: '2026-04-24T13:15:00.000Z',
  status: 'open',
  groupTimezone: 'Asia/Seoul',
};

const VALID_BODY = {
  promptId: 'prompt-12',
  recordingStartedAt: '2026-04-24T12:05:00.000Z',
  fileSizeBytes: 2_000_000,
} as const;

Deno.test('finalizeClip: happy path → new clip with canonical storage path', async () => {
  const repo = new FakeRepo(SNAPSHOT, true, { clipId: 'c1', replaced: false });
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'u1', body: VALID_BODY },
  );
  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.clipId, 'c1');
  assertEquals(result.replaced, false);
  assertEquals(repo.upsertCalls[0]?.storagePath, 'raw/g1/prompt-12/u1.mp4');
  assertEquals(repo.upsertCalls[0]?.isLate, false);
});

Deno.test('finalizeClip: rejects invalid body before touching repo', async () => {
  const repo = new FakeRepo(SNAPSHOT);
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'u1', body: { ...VALID_BODY, fileSizeBytes: 0 } },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'VALIDATION_FAILED');
  assertEquals(repo.upsertCalls.length, 0);
});

Deno.test('finalizeClip: NOT_FOUND when prompt missing', async () => {
  const repo = new FakeRepo(null);
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'u1', body: VALID_BODY },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'NOT_FOUND');
});

Deno.test('finalizeClip: FORBIDDEN when user not a member', async () => {
  const repo = new FakeRepo(SNAPSHOT, false);
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'stranger', body: VALID_BODY },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'FORBIDDEN');
});

Deno.test('finalizeClip: PROMPT_MISMATCH when recording maps to a different prompt', async () => {
  const repo = new FakeRepo(
    SNAPSHOT,
    true,
    { clipId: 'c1', replaced: false },
    {
      ...SNAPSHOT,
      promptId: 'prompt-13',
    },
  );
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'u1', body: VALID_BODY },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'PROMPT_MISMATCH');
  assertEquals(repo.upsertCalls.length, 0);
});

Deno.test('finalizeClip: SLOT_CLOSED when prompt is closed', async () => {
  const repo = new FakeRepo({ ...SNAPSHOT, status: 'closed' });
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'u1', body: VALID_BODY },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'SLOT_CLOSED');
});

Deno.test('finalizeClip: CLOCK_SKEW with >5min drift', async () => {
  const repo = new FakeRepo(SNAPSHOT);
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:20:00.000Z')) },
    { userId: 'u1', body: { ...VALID_BODY, recordingStartedAt: '2026-04-24T12:05:00.000Z' } },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'CLOCK_SKEW');
});

Deno.test('finalizeClip: replaced=true propagates on upsert', async () => {
  const repo = new FakeRepo(SNAPSHOT, true, { clipId: 'c1', replaced: true });
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T12:10:00.000Z')) },
    { userId: 'u1', body: VALID_BODY },
  );
  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.replaced, true);
});

Deno.test(
  'finalizeClip: is_late=true when recording after slot_ends_at but within grace',
  async () => {
    const repo = new FakeRepo(SNAPSHOT);
    const result = await finalizeClip(
      { repo, clock: new FixedClock(new Date('2026-04-24T13:06:00.000Z')) },
      { userId: 'u1', body: { ...VALID_BODY, recordingStartedAt: '2026-04-24T13:05:00.000Z' } },
    );
    if (!result.ok) throw new Error('expected ok');
    assertEquals(repo.upsertCalls[0]?.isLate, true);
  },
);

Deno.test('finalizeClip: is_late=false exactly at slot_ends_at', async () => {
  const repo = new FakeRepo(SNAPSHOT);
  const result = await finalizeClip(
    { repo, clock: new FixedClock(new Date('2026-04-24T13:00:30.000Z')) },
    { userId: 'u1', body: { ...VALID_BODY, recordingStartedAt: '2026-04-24T13:00:00.000Z' } },
  );
  if (!result.ok) throw new Error('expected ok');
  assertEquals(repo.upsertCalls[0]?.isLate, false);
});
