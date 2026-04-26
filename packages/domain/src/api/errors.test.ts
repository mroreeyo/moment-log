import { describe, it, expect } from '@jest/globals';
import {
  type DomainError,
  type DomainErrorCode,
  DOMAIN_ERROR_CODES,
  isDomainError,
  toErrorResponse,
} from './errors.js';

describe('DomainError — PRD 부록 B 에러 코드', () => {
  const expected: ReadonlyArray<DomainErrorCode> = [
    'SLOT_CLOSED',
    'PROMPT_MISMATCH',
    'CLOCK_SKEW',
    'RAW_EXPIRED',
    'RETRY_COOLDOWN',
    'RETRY_EXHAUSTED',
    'INVITE_INVALID',
    'INVITE_RATE_LIMITED',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_FAILED',
  ];

  it('exposes exactly the codes enumerated in PRD 부록 B + 공통 에러', () => {
    expect([...DOMAIN_ERROR_CODES].sort()).toEqual([...expected].sort());
  });

  it('freezes the codes tuple so it cannot be mutated at runtime', () => {
    expect(Object.isFrozen(DOMAIN_ERROR_CODES)).toBe(true);
  });
});

describe('isDomainError', () => {
  it('returns true for a properly shaped error', () => {
    const e: DomainError = { code: 'SLOT_CLOSED', promptId: 'abc' };
    expect(isDomainError(e)).toBe(true);
  });

  it('returns false for unknown shape', () => {
    expect(isDomainError(null)).toBe(false);
    expect(isDomainError(undefined)).toBe(false);
    expect(isDomainError({})).toBe(false);
    expect(isDomainError({ code: 'not-a-real-code' })).toBe(false);
    expect(isDomainError('string')).toBe(false);
    expect(isDomainError({ code: 123 })).toBe(false);
  });
});

describe('toErrorResponse', () => {
  it('maps each code to the correct HTTP status per PRD 부록 B', () => {
    const cases: ReadonlyArray<[DomainError, number]> = [
      [{ code: 'SLOT_CLOSED', promptId: 'p' }, 409],
      [{ code: 'PROMPT_MISMATCH', expected: 'a', actual: 'b' }, 409],
      [{ code: 'CLOCK_SKEW', serverTime: '2026-04-24T12:00:05Z' }, 422],
      [{ code: 'RAW_EXPIRED', promptId: 'p' }, 410],
      [{ code: 'RETRY_COOLDOWN', retryAfterSec: 300 }, 429],
      [{ code: 'RETRY_EXHAUSTED' }, 429],
      [{ code: 'INVITE_INVALID' }, 404],
      [{ code: 'INVITE_RATE_LIMITED', retryAfterSec: 900 }, 429],
      [{ code: 'UNAUTHORIZED' }, 401],
      [{ code: 'FORBIDDEN' }, 403],
      [{ code: 'NOT_FOUND', resource: 'group' }, 404],
      [{ code: 'VALIDATION_FAILED', details: { fields: ['name'] } }, 400],
    ];
    for (const [err, status] of cases) {
      expect(toErrorResponse(err).status).toBe(status);
    }
  });

  it('produces a body containing the code and a Korean message', () => {
    const { body } = toErrorResponse({ code: 'SLOT_CLOSED', promptId: 'p' });
    expect(body.error).toBe('SLOT_CLOSED');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('includes retryAfterSec in RETRY_COOLDOWN details', () => {
    const { body } = toErrorResponse({ code: 'RETRY_COOLDOWN', retryAfterSec: 300 });
    expect(body.details).toMatchObject({ retryAfterSec: 300 });
  });

  it('includes retryAfterSec in INVITE_RATE_LIMITED details', () => {
    const { body } = toErrorResponse({ code: 'INVITE_RATE_LIMITED', retryAfterSec: 900 });
    expect(body.details).toMatchObject({ retryAfterSec: 900 });
  });

  it('includes serverTime for CLOCK_SKEW', () => {
    const { body } = toErrorResponse({
      code: 'CLOCK_SKEW',
      serverTime: '2026-04-24T12:00:05Z',
    });
    expect(body.details).toMatchObject({ serverTime: '2026-04-24T12:00:05Z' });
  });

  it('passes through VALIDATION_FAILED details verbatim', () => {
    const { body } = toErrorResponse({
      code: 'VALIDATION_FAILED',
      details: { fields: ['name', 'timezone'] },
    });
    expect(body.details).toMatchObject({ fields: ['name', 'timezone'] });
  });
});
