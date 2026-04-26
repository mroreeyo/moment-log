export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface DetectClockSkewInput {
  readonly clientTime: string;
  readonly serverTime: string;
  readonly toleranceMs?: number;
}

export interface ClockSkewResult {
  readonly skewed: boolean;
  readonly skewMs: number;
}

export const detectClockSkew = (input: DetectClockSkewInput): ClockSkewResult => {
  const { clientTime, serverTime, toleranceMs = CLOCK_SKEW_TOLERANCE_MS } = input;
  const clientMs = parseIso(clientTime, 'clientTime');
  const serverMs = parseIso(serverTime, 'serverTime');
  const skewMs = clientMs - serverMs;
  return {
    skewed: Math.abs(skewMs) > toleranceMs,
    skewMs,
  };
};

const parseIso = (iso: string, field: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid ${field}: ${iso}`);
  }
  return ms;
};
