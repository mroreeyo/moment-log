export type ClipStatus = 'uploaded';

export interface Clip {
  readonly id: string;
  readonly promptId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly storagePath: string;
  readonly recordingStartedAt: string;
  readonly uploadCompletedAt: string;
  readonly rawDeleteAt: string;
  readonly durationSec: number;
  readonly fileSizeBytes: number;
  readonly status: ClipStatus;
  readonly isLate: boolean;
  readonly createdAt: string;
}

export type StoragePath = `raw/${string}/${string}/${string}.mp4`;

export const buildRawStoragePath = (
  groupId: string,
  promptId: string,
  userId: string,
): StoragePath => `raw/${groupId}/${promptId}/${userId}.mp4`;
