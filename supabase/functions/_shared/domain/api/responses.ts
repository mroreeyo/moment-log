import type { VlogState } from '../vlog/state.ts';
import type { UserFacingSlotStatus } from '../vlog/display.ts';

export interface PostGroupsResponse {
  readonly groupId: string;
  readonly inviteCode: string;
  readonly inviteExpiresAt: string;
}

export interface PostInviteAcceptResponse {
  readonly groupId: string;
  readonly groupName: string;
  readonly memberCount: number;
}

export interface PostClipsUploadUrlResponse {
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly storagePath: string;
}

export interface PostClipsResponse {
  readonly clipId: string;
  readonly promptId: string;
  readonly storagePath: string;
  readonly replaced: boolean;
}

export interface SlotSummary {
  readonly promptId: string;
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
  readonly graceEndsAt: string;
  readonly status: 'open' | 'closed';
  readonly outcome: Extract<VlogState, { readonly outcome: unknown }>['outcome'];
  readonly userFacingStatus: UserFacingSlotStatus;
  readonly expired: boolean;
  readonly clipCount: number;
  readonly expectedCount: number;
  readonly myClipExists: boolean;
  readonly vlogUrl: string | null;
  readonly clips: readonly never[];
}

export interface GetGroupSlotsResponse {
  readonly groupId: string;
  readonly date: string;
  readonly slots: readonly SlotSummary[];
}

export interface SlotUrlsClipEntry {
  readonly userId: string;
  readonly displayName: string;
  readonly clipUrl: string | null;
}

export interface GetSlotUrlsResponse {
  readonly promptId: string;
  readonly vlogUrl: string | null;
  readonly clips: readonly SlotUrlsClipEntry[];
}

export interface PostVlogRetryResponse {
  readonly status: 'pending';
  readonly retryCount: number;
  readonly message: string;
}

export interface PostInviteRegenerateResponse {
  readonly inviteCode: string;
  readonly inviteExpiresAt: string;
}

export interface PostCronHourlyTickResponse {
  readonly promptsCreated: number;
  readonly promptsClosed: number;
  readonly pushesAttempted: number;
  readonly pushesSucceeded: number;
  readonly workersEnqueued: number;
  readonly cronRunId: string;
}

export interface PostCronRawDeleteResponse {
  readonly clipsDeleted: number;
  readonly cronRunId: string;
}

export interface PostCompileResponse {
  readonly status: 'done' | 'failed';
  readonly outcome: 'compiled' | 'failed';
  readonly vlogStoragePath: string | null;
}
