import { Api, Group } from '@momentlog/domain/index.ts';
import type { Clock } from '../ports/driven/clock.ts';
import type { GroupRepository } from '../ports/driven/group.repository.ts';
import type { InviteAttemptRepository } from '../ports/driven/invite-attempt.repository.ts';

const ATTEMPT_WINDOW_MS = Math.max(Group.RATE_LIMIT_WINDOW_MS, Group.FAIL_BLOCK_WINDOW_MS);

export interface AcceptInviteInput {
  readonly userId: string;
  readonly ipAddress: string;
  readonly code: string;
}

export interface AcceptInviteOkOutput {
  readonly ok: true;
  readonly groupId: string;
  readonly groupName: string;
  readonly memberCount: number;
}

export type AcceptInviteOutput =
  | AcceptInviteOkOutput
  | { readonly ok: false; readonly error: Api.DomainError };

export interface AcceptInviteDeps {
  readonly groupRepo: GroupRepository;
  readonly attempts: InviteAttemptRepository;
  readonly clock: Clock;
}

export const acceptInvite = async (
  deps: AcceptInviteDeps,
  input: AcceptInviteInput,
): Promise<AcceptInviteOutput> => {
  const now = deps.clock.now();

  if (!Group.isValidInviteCode(input.code)) {
    await deps.attempts.record({
      inviteCode: input.code,
      ipAddress: input.ipAddress,
      success: false,
    });
    return { ok: false, error: { code: 'INVITE_INVALID' } };
  }

  const recent = await deps.attempts.recentAttempts(input.ipAddress, ATTEMPT_WINDOW_MS);
  const rate = Group.evaluateInviteRateLimit({ now, attempts: recent });
  if (!rate.allowed) {
    return {
      ok: false,
      error: { code: 'INVITE_RATE_LIMITED', retryAfterSec: rate.retryAfterSec },
    };
  }

  const resolved = await deps.groupRepo.resolveInviteCode(input.code);
  if (!resolved) {
    await deps.attempts.record({
      inviteCode: input.code,
      ipAddress: input.ipAddress,
      success: false,
    });
    return { ok: false, error: { code: 'INVITE_INVALID' } };
  }

  if (Date.parse(resolved.inviteExpiresAt) < now.getTime()) {
    await deps.attempts.record({
      inviteCode: input.code,
      ipAddress: input.ipAddress,
      success: false,
    });
    return { ok: false, error: { code: 'INVITE_INVALID' } };
  }

  const cap = Group.canAddMember({ currentMemberCount: resolved.currentMemberCount });
  if (!cap.ok) {
    await deps.attempts.record({
      inviteCode: input.code,
      ipAddress: input.ipAddress,
      success: false,
    });
    return {
      ok: false,
      error: { code: 'FORBIDDEN' },
    };
  }

  await deps.groupRepo.addMember({ groupId: resolved.groupId, userId: input.userId });
  await deps.attempts.record({
    inviteCode: input.code,
    ipAddress: input.ipAddress,
    success: true,
  });

  return {
    ok: true,
    groupId: resolved.groupId,
    groupName: '',
    memberCount: resolved.currentMemberCount + 1,
  };
};
