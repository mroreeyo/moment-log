export type GroupMemberRole = 'owner' | 'member';

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly timezone: string;
  readonly activeHourStart: number;
  readonly activeHourEnd: number;
  readonly inviteCode: string;
  readonly inviteExpiresAt: string;
  readonly createdAt: string;
}

export interface GroupMember {
  readonly groupId: string;
  readonly userId: string;
  readonly role: GroupMemberRole;
  readonly consecutiveMissedCount: number;
  readonly mutedUntil: string | null;
  readonly joinedAt: string;
}
