import { assertEquals } from '@std/assert';
import { createGroup } from './create-group.ts';
import type {
  GroupCreateResult,
  GroupRepository,
  GroupRepositoryCreateInput,
  InviteCodeResolution,
} from '../ports/driven/group.repository.ts';
import type { RandomBytesPort } from '../ports/driven/random-bytes.ts';
import type { Clock } from '../ports/driven/clock.ts';

class SuccessRepo implements GroupRepository {
  calls: GroupRepositoryCreateInput[] = [];
  createGroupWithOwner(input: GroupRepositoryCreateInput): Promise<GroupCreateResult> {
    this.calls.push(input);
    return Promise.resolve({
      ok: true,
      value: {
        groupId: 'g-new',
        inviteCode: input.inviteCode,
        inviteExpiresAt: input.inviteExpiresAt,
      },
    });
  }
  resolveInviteCode(): Promise<InviteCodeResolution | null> {
    return Promise.resolve(null);
  }
  addMember(): Promise<void> {
    return Promise.resolve();
  }
}

class ConflictThenSuccessRepo implements GroupRepository {
  private count = 0;
  createGroupWithOwner(input: GroupRepositoryCreateInput): Promise<GroupCreateResult> {
    this.count++;
    if (this.count < 3) {
      return Promise.resolve({ ok: false, reason: 'INVITE_CODE_CONFLICT' });
    }
    return Promise.resolve({
      ok: true,
      value: {
        groupId: 'g-new',
        inviteCode: input.inviteCode,
        inviteExpiresAt: input.inviteExpiresAt,
      },
    });
  }
  resolveInviteCode(): Promise<InviteCodeResolution | null> {
    return Promise.resolve(null);
  }
  addMember(): Promise<void> {
    return Promise.resolve();
  }
}

class DeterministicRandom implements RandomBytesPort {
  private counter = 0;
  bytes(length: number): Uint8Array {
    const buf = new Uint8Array(length);
    for (let i = 0; i < length; i++) buf[i] = (this.counter + i) & 0xff;
    this.counter += length;
    return buf;
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-04-24T12:00:00.000Z');
  }
}

const validBody = {
  name: '우리둘',
  timezone: 'Asia/Seoul',
  activeHourStart: 9,
  activeHourEnd: 22,
};

Deno.test('createGroup: happy path returns groupId and invite code + 24h expiry', async () => {
  const repo = new SuccessRepo();
  const result = await createGroup(
    { repo, random: new DeterministicRandom(), clock: new FixedClock() },
    { userId: 'u1', body: validBody },
  );
  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.groupId, 'g-new');
  assertEquals(result.inviteCode.length, 8);
  assertEquals(result.inviteExpiresAt, '2026-04-25T12:00:00.000Z');
  assertEquals(repo.calls.length, 1);
  assertEquals(repo.calls[0]!.name, '우리둘');
  assertEquals(repo.calls[0]!.ownerId, 'u1');
});

Deno.test('createGroup: rejects invalid input before touching repo', async () => {
  const repo = new SuccessRepo();
  const result = await createGroup(
    { repo, random: new DeterministicRandom(), clock: new FixedClock() },
    { userId: 'u1', body: { ...validBody, activeHourStart: 30 } },
  );
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'VALIDATION_FAILED');
  assertEquals(repo.calls.length, 0);
});

Deno.test('createGroup: retries up to 5 times on invite code conflict', async () => {
  const repo = new ConflictThenSuccessRepo();
  const result = await createGroup(
    { repo, random: new DeterministicRandom(), clock: new FixedClock() },
    { userId: 'u1', body: validBody },
  );
  if (!result.ok) throw new Error('expected ok after retries');
  assertEquals(result.groupId, 'g-new');
});
