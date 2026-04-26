export const MAX_GROUP_MEMBERS = 4;

export interface CanAddMemberInput {
  readonly currentMemberCount: number;
}

export type CanAddMemberResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'GROUP_FULL' | 'INVALID_COUNT' };

export const canAddMember = (input: CanAddMemberInput): CanAddMemberResult => {
  const n = input.currentMemberCount;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    return { ok: false, reason: 'INVALID_COUNT' };
  }
  if (n >= MAX_GROUP_MEMBERS) {
    return { ok: false, reason: 'GROUP_FULL' };
  }
  return { ok: true };
};
