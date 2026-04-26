export interface PromptFinalizeSnapshot {
  readonly promptId: string;
  readonly groupId: string;
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
  readonly graceEndsAt: string;
  readonly status: 'open' | 'closed';
  readonly groupTimezone: string;
}

export interface UpsertClipInput {
  readonly promptId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly storagePath: string;
  readonly recordingStartedAt: string;
  readonly fileSizeBytes: number;
  readonly isLate: boolean;
  readonly groupTimezone: string;
}

export interface UpsertClipResult {
  readonly clipId: string;
  readonly replaced: boolean;
}

export interface ClipRepository {
  findPromptForFinalize(promptId: string): Promise<PromptFinalizeSnapshot | null>;
  findPromptForRecording(
    groupId: string,
    recordingStartedAt: string,
  ): Promise<PromptFinalizeSnapshot | null>;
  isMember(userId: string, groupId: string): Promise<boolean>;
  upsertClip(input: UpsertClipInput): Promise<UpsertClipResult>;
}
