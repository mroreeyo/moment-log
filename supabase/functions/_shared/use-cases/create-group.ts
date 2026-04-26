import { Api, Group } from '@momentlog/domain/index.ts';
import type { Clock } from '../ports/driven/clock.ts';
import type { GroupRepository } from '../ports/driven/group.repository.ts';
import type { RandomBytesPort } from '../ports/driven/random-bytes.ts';

const MAX_INVITE_CODE_RETRIES = 5;

export interface CreateGroupInput {
  readonly userId: string;
  readonly body: Group.CreateGroupInput;
}

export interface CreateGroupOkOutput {
  readonly ok: true;
  readonly groupId: string;
  readonly inviteCode: string;
  readonly inviteExpiresAt: string;
}

export type CreateGroupOutput =
  | CreateGroupOkOutput
  | { readonly ok: false; readonly error: Api.DomainError };

export interface CreateGroupDeps {
  readonly repo: GroupRepository;
  readonly random: RandomBytesPort;
  readonly clock: Clock;
}

export const createGroup = async (
  deps: CreateGroupDeps,
  input: CreateGroupInput,
): Promise<CreateGroupOutput> => {
  const validation = Group.validateCreateGroupInput(input.body);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const v = validation.value;
  const inviteExpiresAt = new Date(deps.clock.now().getTime() + Group.INVITE_TTL_MS).toISOString();

  let lastResult: 'CONFLICT' | 'OK' = 'CONFLICT';
  let createdGroupId = '';
  let createdCode = '';
  for (let attempt = 0; attempt < MAX_INVITE_CODE_RETRIES; attempt++) {
    const code = Group.generateInviteCode((n) => deps.random.bytes(n));
    const result = await deps.repo.createGroupWithOwner({
      name: v.name,
      ownerId: input.userId,
      timezone: v.timezone,
      activeHourStart: v.activeHourStart,
      activeHourEnd: v.activeHourEnd,
      inviteCode: code,
      inviteExpiresAt,
    });
    if (result.ok) {
      lastResult = 'OK';
      createdGroupId = result.value.groupId;
      createdCode = result.value.inviteCode;
      break;
    }
    if (result.reason !== 'INVITE_CODE_CONFLICT') {
      break;
    }
  }

  if (lastResult !== 'OK') {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        details: { fields: ['inviteCode'], reason: 'CODE_GENERATION_FAILED' },
      },
    };
  }

  return {
    ok: true,
    groupId: createdGroupId,
    inviteCode: createdCode,
    inviteExpiresAt,
  };
};
