export interface GroupRepositoryCreateInput {
  readonly name: string;
  readonly ownerId: string;
  readonly timezone: string;
  readonly activeHourStart: number;
  readonly activeHourEnd: number;
  readonly inviteCode: string;
  readonly inviteExpiresAt: string;
}

export interface GroupRepositoryCreated {
  readonly groupId: string;
  readonly inviteCode: string;
  readonly inviteExpiresAt: string;
}

export type GroupCreateResult =
  | { readonly ok: true; readonly value: GroupRepositoryCreated }
  | { readonly ok: false; readonly reason: 'INVITE_CODE_CONFLICT' };

export interface InviteCodeResolution {
  readonly groupId: string;
  readonly inviteExpiresAt: string;
  readonly currentMemberCount: number;
}

export interface GroupRepository {
  createGroupWithOwner(input: GroupRepositoryCreateInput): Promise<GroupCreateResult>;
  resolveInviteCode(code: string): Promise<InviteCodeResolution | null>;
  addMember(input: { readonly groupId: string; readonly userId: string }): Promise<void>;
}
