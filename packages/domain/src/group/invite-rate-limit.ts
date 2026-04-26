export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_MAX = 10;
export const FAIL_BLOCK_WINDOW_MS = 15 * 60 * 1000;
export const FAIL_BLOCK_THRESHOLD = 5;
export const FAIL_BLOCK_DURATION_MS = 15 * 60 * 1000;

export interface InviteAttempt {
  readonly attemptedAt: string;
  readonly success: boolean;
}

export interface EvaluateInviteRateLimitInput {
  readonly now: Date;
  readonly attempts: readonly InviteAttempt[];
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'RATE_LIMITED_HOURLY' | 'FAILURE_BLOCK';
      readonly retryAfterSec: number;
    };

export const evaluateInviteRateLimit = (input: EvaluateInviteRateLimitInput): RateLimitDecision => {
  const nowMs = input.now.getTime();
  const attempts = input.attempts.map((a) => {
    const ms = Date.parse(a.attemptedAt);
    if (Number.isNaN(ms)) {
      throw new Error(`invalid attemptedAt: ${a.attemptedAt}`);
    }
    return { ms, success: a.success };
  });

  const recentFailures = attempts.filter((a) => !a.success && nowMs - a.ms <= FAIL_BLOCK_WINDOW_MS);
  if (recentFailures.length >= FAIL_BLOCK_THRESHOLD) {
    const newestFailureMs = Math.max(...recentFailures.map((a) => a.ms));
    const retryAfterSec = Math.max(
      1,
      Math.ceil((newestFailureMs + FAIL_BLOCK_DURATION_MS - nowMs) / 1000),
    );
    return { allowed: false, reason: 'FAILURE_BLOCK', retryAfterSec };
  }

  const withinHour = attempts.filter((a) => nowMs - a.ms <= RATE_LIMIT_WINDOW_MS);
  if (withinHour.length > RATE_LIMIT_MAX) {
    const oldestInWindowMs = Math.min(...withinHour.map((a) => a.ms));
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestInWindowMs + RATE_LIMIT_WINDOW_MS - nowMs) / 1000),
    );
    return { allowed: false, reason: 'RATE_LIMITED_HOURLY', retryAfterSec };
  }

  return { allowed: true };
};
