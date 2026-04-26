import type { InviteAttempt } from '@momentlog/domain/group/index.ts';

export interface RecordAttemptInput {
  readonly inviteCode: string;
  readonly ipAddress: string;
  readonly success: boolean;
}

export interface InviteAttemptRepository {
  recentAttempts(ipAddress: string, sinceMs: number): Promise<readonly InviteAttempt[]>;
  record(input: RecordAttemptInput): Promise<void>;
}
