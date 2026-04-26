export interface PostGroupsRequest {
  readonly name: string;
  readonly timezone: string;
  readonly activeHourStart: number;
  readonly activeHourEnd: number;
}

export interface PostInviteAcceptRequest {
  readonly code: string;
}

export interface PostClipsUploadUrlRequest {
  readonly promptId: string;
  readonly mimeType: 'video/mp4';
  readonly fileSizeBytes: number;
}

export interface PostClipsRequest {
  readonly promptId: string;
  readonly storagePath: string;
  readonly recordingStartedAt: string;
  readonly fileSizeBytes: number;
}

export interface PostVlogRetryRequest {
  readonly promptId: string;
}

export interface PostInviteRegenerateRequest {
  readonly groupId: string;
}

export interface GetGroupSlotsQuery {
  readonly groupId: string;
  readonly date: string;
}

export interface GetSlotUrlsQuery {
  readonly promptId: string;
}

export interface PostCronHourlyTickRequest {
  readonly dispatchedAt: string;
}

export interface PostCronRawDeleteRequest {
  readonly dispatchedAt: string;
}

export interface PostCompileRequest {
  readonly promptId: string;
  readonly groupId: string;
  readonly triggerType: 'hourly-tick' | 'retry';
}
