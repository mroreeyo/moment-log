import { assertEquals } from '@std/assert';
import { acceptInvite } from './accept-invite.ts';
import type {
  GroupCreateResult,
  GroupRepository,
  GroupRepositoryCreateInput,
  InviteCodeResolution,
} from '../ports/driven/group.repository.ts';
import type {
  InviteAttemptRepository,
  RecordAttemptInput,
} from '../ports/driven/invite-attempt.repository.ts';
import type { InviteAttempt } from '@momentlog/domain/group/index.ts';
import type { Clock } from '../ports/driven/clock.ts';

class FakeGroupRepo implements GroupRepository {
  addMemberCalls: { groupId: string; userId: string }[] = [];
  constructor(private readonly resolution: InviteCodeResolution | null) {}
  createGroupWithOwner(_: GroupRepositoryCreateInput): Promise<GroupCreateResult> {
    return Promise.resolve({ ok: false, reason: 'INVITE_CODE_CONFLICT' });
  }
  resolveInviteCode(): Promise<InviteCodeResolution | null> {
    return Promise.resolve(this.resolution);
  }
  addMember(input: { groupId: string; userId: string }): Promise<void> {
    this.addMemberCalls.push(input);
    return Promise.resolve();
  }
}

class FakeAttempts implements InviteAttemptRepository {
  records: RecordAttemptInput[] = [];
  constructor(private readonly recent: readonly InviteAttempt[] = []) {}
  recentAttempts(): Promise<readonly InviteAttempt[]> {
    return Promise.resolve(this.recent);
  }
  record(input: RecordAttemptInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-04-24T12:00:00.000Z');
  }
}

const VALID_CODE = 'ABCD2345';

Deno.test(
  'acceptInvite: invalid code format returns INVITE_INVALID and records failure',
  async () => {
    const attempts = new FakeAttempts();
    const result = await acceptInvite(
      {
        groupRepo: new FakeGroupRepo(null),
        attempts,
        clock: new FixedClock(),
      },
      { userId: 'u', ipAddress: '1.2.3.4', code: 'bad' },
    );
    if (result.ok) throw new Error('expected error');
    assertEquals(result.error.code, 'INVITE_INVALID');
    assertEquals(attempts.records.length, 1);
    assertEquals(attempts.records[0]!.success, false);
  },
);

Deno.test('acceptInvite: rate-limited IP gets INVITE_RATE_LIMITED', async () => {
  const many: InviteAttempt[] = Array.from({ length: 12 }, (_, i) => ({
    attemptedAt: new Date('2026-04-24T11:45:00.000Z')
      .toISOString()
      .replace('11:45', `11:${50 - i}`.slice(0, 5)),
    success: true,
  }));
  const attempts = new FakeAttempts(many);
  const result = await acceptInvite(
    {
      groupRepo: new FakeGroupRepo({
        groupId: 'g1',
        inviteExpiresAt: '2030-01-01T00:00:00.000Z',
        currentMemberCount: 2,
      }),
      attempts,
      clock: new FixedClock(),
    },
    { userId: 'u', ipAddress: '1.2.3.4', code: VALID_CODE },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'INVITE_RATE_LIMITED');
});

Deno.test('acceptInvite: code not found returns INVITE_INVALID', async () => {
  const result = await acceptInvite(
    {
      groupRepo: new FakeGroupRepo(null),
      attempts: new FakeAttempts(),
      clock: new FixedClock(),
    },
    { userId: 'u', ipAddress: '1.2.3.4', code: VALID_CODE },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'INVITE_INVALID');
});

Deno.test('acceptInvite: expired invite returns INVITE_INVALID', async () => {
  const result = await acceptInvite(
    {
      groupRepo: new FakeGroupRepo({
        groupId: 'g1',
        inviteExpiresAt: '2020-01-01T00:00:00.000Z',
        currentMemberCount: 1,
      }),
      attempts: new FakeAttempts(),
      clock: new FixedClock(),
    },
    { userId: 'u', ipAddress: '1.2.3.4', code: VALID_CODE },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'INVITE_INVALID');
});

Deno.test('acceptInvite: group already at capacity returns FORBIDDEN', async () => {
  const result = await acceptInvite(
    {
      groupRepo: new FakeGroupRepo({
        groupId: 'g1',
        inviteExpiresAt: '2030-01-01T00:00:00.000Z',
        currentMemberCount: 4,
      }),
      attempts: new FakeAttempts(),
      clock: new FixedClock(),
    },
    { userId: 'u', ipAddress: '1.2.3.4', code: VALID_CODE },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'FORBIDDEN');
});

Deno.test('acceptInvite: happy path adds member and records success', async () => {
  const repo = new FakeGroupRepo({
    groupId: 'g1',
    inviteExpiresAt: '2030-01-01T00:00:00.000Z',
    currentMemberCount: 2,
  });
  const attempts = new FakeAttempts();
  const result = await acceptInvite(
    { groupRepo: repo, attempts, clock: new FixedClock() },
    { userId: 'u-new', ipAddress: '1.2.3.4', code: VALID_CODE },
  );
  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.groupId, 'g1');
  assertEquals(result.memberCount, 3);
  assertEquals(repo.addMemberCalls.length, 1);
  assertEquals(attempts.records.length, 1);
  assertEquals(attempts.records[0]!.success, true);
});
