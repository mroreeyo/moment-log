import { Api, Clip } from '@momentlog/domain/index.ts';
import type { Clock } from '../ports/driven/clock.ts';
import type { ClipRepository } from '../ports/driven/clip.repository.ts';

export interface FinalizeClipInput {
  readonly userId: string;
  readonly body: Clip.FinalizeBodyInput;
}

export interface FinalizeClipOkOutput {
  readonly ok: true;
  readonly clipId: string;
  readonly replaced: boolean;
  readonly promptId: string;
  readonly storagePath: string;
}

export type FinalizeClipOutput =
  | FinalizeClipOkOutput
  | { readonly ok: false; readonly error: Api.DomainError };

export interface FinalizeClipDeps {
  readonly repo: ClipRepository;
  readonly clock: Clock;
}

export const finalizeClip = async (
  deps: FinalizeClipDeps,
  input: FinalizeClipInput,
): Promise<FinalizeClipOutput> => {
  const bodyValidation = Clip.validateFinalizeBody(input.body);
  if (!bodyValidation.ok) {
    return { ok: false, error: bodyValidation.error };
  }
  const body = bodyValidation.value;

  const prompt = await deps.repo.findPromptForFinalize(body.promptId);
  if (!prompt) {
    return { ok: false, error: { code: 'NOT_FOUND', resource: 'prompt' } };
  }

  const member = await deps.repo.isMember(input.userId, prompt.groupId);
  if (!member) {
    return { ok: false, error: { code: 'FORBIDDEN' } };
  }

  const recalculatedPrompt = await deps.repo.findPromptForRecording(
    prompt.groupId,
    body.recordingStartedAt,
  );
  if (!recalculatedPrompt || recalculatedPrompt.promptId !== prompt.promptId) {
    return {
      ok: false,
      error: {
        code: 'PROMPT_MISMATCH',
        expected: recalculatedPrompt?.promptId ?? 'none',
        actual: prompt.promptId,
      },
    };
  }

  const decision = Clip.finalizeSlotDecision({
    recordingStartedAt: body.recordingStartedAt,
    now: deps.clock.now(),
    prompt: {
      promptId: prompt.promptId,
      groupId: prompt.groupId,
      slotStartsAt: prompt.slotStartsAt,
      slotEndsAt: prompt.slotEndsAt,
      graceEndsAt: prompt.graceEndsAt,
      status: prompt.status,
    },
  });
  if (!decision.ok) {
    return { ok: false, error: decision.error };
  }

  const storagePath = Clip.buildRawStoragePath(prompt.groupId, prompt.promptId, input.userId);
  const upserted = await deps.repo.upsertClip({
    promptId: prompt.promptId,
    groupId: prompt.groupId,
    userId: input.userId,
    storagePath,
    recordingStartedAt: body.recordingStartedAt,
    fileSizeBytes: body.fileSizeBytes,
    isLate: decision.isLate,
    groupTimezone: prompt.groupTimezone,
  });

  return {
    ok: true,
    clipId: upserted.clipId,
    replaced: upserted.replaced,
    promptId: prompt.promptId,
    storagePath,
  };
};
