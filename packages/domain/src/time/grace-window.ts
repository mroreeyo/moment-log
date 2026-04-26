export const GRACE_WINDOW_MIN = 15;
const DEFAULT_SLOT_DURATION_MIN = 60;

export interface ComputeSlotWindowInput {
  readonly slotStartsAt: string;
  readonly slotDurationMin?: number;
  readonly graceDurationMin?: number;
}

export interface SlotWindow {
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
  readonly graceEndsAt: string;
}

export const computeSlotWindow = (input: ComputeSlotWindowInput): SlotWindow => {
  const {
    slotStartsAt,
    slotDurationMin = DEFAULT_SLOT_DURATION_MIN,
    graceDurationMin = GRACE_WINDOW_MIN,
  } = input;
  const startMs = parseIso(slotStartsAt, 'slotStartsAt');
  const endMs = startMs + slotDurationMin * 60 * 1000;
  const graceMs = endMs + graceDurationMin * 60 * 1000;
  return {
    slotStartsAt: new Date(startMs).toISOString(),
    slotEndsAt: new Date(endMs).toISOString(),
    graceEndsAt: new Date(graceMs).toISOString(),
  };
};

export interface IsWithinGraceWindowInput {
  readonly finalizeAt: string;
  readonly graceEndsAt: string;
}

export const isWithinGraceWindow = (input: IsWithinGraceWindowInput): boolean => {
  const finalizeMs = parseIso(input.finalizeAt, 'finalizeAt');
  const graceMs = parseIso(input.graceEndsAt, 'graceEndsAt');
  return finalizeMs <= graceMs;
};

const parseIso = (iso: string, field: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid ${field}: ${iso}`);
  }
  return ms;
};
