export interface CandidateSlot {
  readonly promptId: string;
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
}

export interface AssignSlotInput {
  readonly recordingStartedAt: string;
  readonly candidates: readonly CandidateSlot[];
}

export type AssignSlotResult =
  | { readonly ok: true; readonly promptId: string }
  | { readonly ok: false; readonly reason: 'NO_MATCHING_SLOT' };

export const assignSlotByRecordingStart = (input: AssignSlotInput): AssignSlotResult => {
  const recordingMs = parseIso(input.recordingStartedAt, 'recordingStartedAt');
  for (const slot of input.candidates) {
    const startMs = parseIso(slot.slotStartsAt, `candidate[${slot.promptId}].slotStartsAt`);
    const endMs = parseIso(slot.slotEndsAt, `candidate[${slot.promptId}].slotEndsAt`);
    if (recordingMs >= startMs && recordingMs < endMs) {
      return { ok: true, promptId: slot.promptId };
    }
  }
  return { ok: false, reason: 'NO_MATCHING_SLOT' };
};

const parseIso = (iso: string, field: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid ${field}: ${iso}`);
  }
  return ms;
};
