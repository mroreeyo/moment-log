import { describe, it, expect } from '@jest/globals';
import {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  FAIL_BLOCK_WINDOW_MS,
  FAIL_BLOCK_THRESHOLD,
  FAIL_BLOCK_DURATION_MS,
  evaluateInviteRateLimit,
  type InviteAttempt,
} from './invite-rate-limit.js';

const NOW = new Date('2026-04-24T12:00:00.000Z');

const secondsBefore = (seconds: number): string =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();

describe('rate limit constants (PRD §8.8)', () => {
  it('hourly window = 3600000ms, max 10', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(RATE_LIMIT_MAX).toBe(10);
  });

  it('fail-block threshold = 5 failures in 15 min, block 15 min', () => {
    expect(FAIL_BLOCK_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(FAIL_BLOCK_THRESHOLD).toBe(5);
    expect(FAIL_BLOCK_DURATION_MS).toBe(15 * 60 * 1000);
  });
});

describe('evaluateInviteRateLimit', () => {
  it('allows a fresh IP with no attempts', () => {
    const r = evaluateInviteRateLimit({ now: NOW, attempts: [] });
    expect(r).toEqual({ allowed: true });
  });

  it('allows 10 attempts in the last hour', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 10 }, (_, i) => ({
      attemptedAt: secondsBefore((i + 1) * 100),
      success: true,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    expect(r.allowed).toBe(true);
  });

  it('blocks the 11th attempt within the hour', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 11 }, (_, i) => ({
      attemptedAt: secondsBefore((i + 1) * 100),
      success: true,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    if (r.allowed) throw new Error('expected blocked');
    expect(r.reason).toBe('RATE_LIMITED_HOURLY');
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it('ignores attempts outside the hourly window', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 15 }, (_, i) => ({
      attemptedAt: secondsBefore(3601 + i * 5),
      success: true,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    expect(r.allowed).toBe(true);
  });

  it('blocks after 5 failures in 15 min', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 5 }, (_, i) => ({
      attemptedAt: secondsBefore((i + 1) * 60),
      success: false,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    if (r.allowed) throw new Error('expected blocked');
    expect(r.reason).toBe('FAILURE_BLOCK');
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(r.retryAfterSec).toBeLessThanOrEqual(FAIL_BLOCK_DURATION_MS / 1000);
  });

  it('does not trigger failure block if fewer than 5 failures', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 4 }, (_, i) => ({
      attemptedAt: secondsBefore((i + 1) * 60),
      success: false,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    expect(r.allowed).toBe(true);
  });

  it('does not trigger failure block for failures older than 15 minutes', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 8 }, (_, i) => ({
      attemptedAt: secondsBefore(15 * 60 + 10 + i * 5),
      success: false,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    expect(r.allowed).toBe(true);
  });

  it('reports earliest retryAfter between the two windows', () => {
    const attempts: InviteAttempt[] = [
      ...Array.from({ length: 11 }, (_, i) => ({
        attemptedAt: secondsBefore(60 + i * 50),
        success: true as const,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        attemptedAt: secondsBefore(10 + i * 10),
        success: false as const,
      })),
    ];
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    if (r.allowed) throw new Error('expected blocked');
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it('retryAfterSec for hourly block is bounded by 1 hour', () => {
    const attempts: InviteAttempt[] = Array.from({ length: 11 }, (_, i) => ({
      attemptedAt: secondsBefore(3599 - i),
      success: true,
    }));
    const r = evaluateInviteRateLimit({ now: NOW, attempts });
    if (r.allowed) throw new Error('expected blocked');
    expect(r.retryAfterSec).toBeLessThanOrEqual(3600);
    expect(r.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('throws on invalid attempt timestamp', () => {
    expect(() =>
      evaluateInviteRateLimit({
        now: NOW,
        attempts: [{ attemptedAt: 'bad', success: true }],
      }),
    ).toThrow(/attemptedAt/);
  });
});
