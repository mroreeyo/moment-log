import type { DomainError } from '../api/errors.js';
import { MAX_CLIP_SIZE_BYTES } from './upload-validation.js';
import { CLOCK_SKEW_TOLERANCE_MS } from '../time/clock-skew.js';

export interface FinalizeBodyInput {
  readonly promptId: string;
  readonly recordingStartedAt: string;
  readonly fileSizeBytes: number;
}

export type FinalizeBodyValidation =
  | { readonly ok: true; readonly value: FinalizeBodyInput }
  | { readonly ok: false; readonly error: DomainError };

export const validateFinalizeBody = (input: FinalizeBodyInput): FinalizeBodyValidation => {
  const fields: string[] = [];
  if (typeof input.promptId !== 'string' || input.promptId.trim().length === 0) {
    fields.push('promptId');
  }
  if (
    typeof input.recordingStartedAt !== 'string' ||
    Number.isNaN(Date.parse(input.recordingStartedAt))
  ) {
    fields.push('recordingStartedAt');
  }
  if (
    typeof input.fileSizeBytes !== 'number' ||
    !Number.isInteger(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > MAX_CLIP_SIZE_BYTES
  ) {
    fields.push('fileSizeBytes');
  }
  if (fields.length > 0) {
    return {
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields } },
    };
  }
  return { ok: true, value: input };
};

export interface FinalizePromptSnapshot {
  readonly promptId: string;
  readonly groupId: string;
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
  readonly graceEndsAt: string;
  readonly status: 'open' | 'closed';
}

export interface FinalizeSlotDecisionInput {
  readonly recordingStartedAt: string;
  readonly now: Date;
  readonly prompt: FinalizePromptSnapshot;
  readonly clockSkewToleranceMs?: number;
}

export type FinalizeSlotDecision =
  | { readonly ok: true; readonly isLate: boolean }
  | { readonly ok: false; readonly error: DomainError };

export const finalizeSlotDecision = (input: FinalizeSlotDecisionInput): FinalizeSlotDecision => {
  const tolerance = input.clockSkewToleranceMs ?? CLOCK_SKEW_TOLERANCE_MS;
  const recordingMs = parseIso(input.recordingStartedAt, 'recordingStartedAt');
  const nowMs = input.now.getTime();
  const slotStartMs = parseIso(input.prompt.slotStartsAt, 'slotStartsAt');
  const slotEndMs = parseIso(input.prompt.slotEndsAt, 'slotEndsAt');
  const graceEndMs = parseIso(input.prompt.graceEndsAt, 'graceEndsAt');

  if (input.prompt.status === 'closed') {
    return {
      ok: false,
      error: { code: 'SLOT_CLOSED', promptId: input.prompt.promptId },
    };
  }

  if (Math.abs(recordingMs - nowMs) > tolerance) {
    return {
      ok: false,
      error: {
        code: 'CLOCK_SKEW',
        serverTime: input.now.toISOString(),
      },
    };
  }

  if (nowMs > graceEndMs) {
    return {
      ok: false,
      error: { code: 'SLOT_CLOSED', promptId: input.prompt.promptId },
    };
  }

  if (recordingMs < slotStartMs || recordingMs > graceEndMs) {
    return {
      ok: false,
      error: {
        code: 'PROMPT_MISMATCH',
        expected: input.prompt.promptId,
        actual: input.recordingStartedAt,
      },
    };
  }

  const isLate = recordingMs > slotEndMs;
  return { ok: true, isLate };
};

const parseIso = (iso: string, field: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid ${field}: ${iso}`);
  }
  return ms;
};
