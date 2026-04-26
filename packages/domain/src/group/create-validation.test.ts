import { describe, it, expect } from '@jest/globals';
import { validateCreateGroupInput } from './create-validation.js';

describe('validateCreateGroupInput', () => {
  const valid = {
    name: '우리둘',
    timezone: 'Asia/Seoul',
    activeHourStart: 9,
    activeHourEnd: 22,
  };

  it('accepts a valid input', () => {
    const r = validateCreateGroupInput(valid);
    expect(r).toEqual({ ok: true, value: valid });
  });

  it('trims name whitespace', () => {
    const r = validateCreateGroupInput({ ...valid, name: '  trimmed  ' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.name).toBe('trimmed');
  });

  it('rejects name that is empty after trim', () => {
    const r = validateCreateGroupInput({ ...valid, name: '   ' });
    expect(r.ok).toBe(false);
  });

  it('rejects non-string name', () => {
    const r = validateCreateGroupInput({
      ...valid,
      name: 42 as unknown as string,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects name longer than 40 chars', () => {
    const r = validateCreateGroupInput({ ...valid, name: 'a'.repeat(41) });
    expect(r.ok).toBe(false);
  });

  it('accepts 40-char name exactly', () => {
    const r = validateCreateGroupInput({ ...valid, name: 'a'.repeat(40) });
    expect(r.ok).toBe(true);
  });

  it('rejects non-IANA timezone (missing slash)', () => {
    const r = validateCreateGroupInput({ ...valid, timezone: 'Seoul' });
    expect(r.ok).toBe(false);
  });

  it('rejects timezone with whitespace', () => {
    const r = validateCreateGroupInput({ ...valid, timezone: 'Asia / Seoul' });
    expect(r.ok).toBe(false);
  });

  it('rejects non-string timezone', () => {
    const r = validateCreateGroupInput({
      ...valid,
      timezone: 42 as unknown as string,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects timezone with invalid characters in regex (e.g. starts with digit)', () => {
    const r = validateCreateGroupInput({ ...valid, timezone: '9Asia/Seoul' });
    expect(r.ok).toBe(false);
  });

  it('accepts common IANA timezones', () => {
    for (const tz of ['Asia/Seoul', 'Asia/Tokyo', 'America/Los_Angeles', 'Europe/Berlin']) {
      const r = validateCreateGroupInput({ ...valid, timezone: tz });
      expect(r.ok).toBe(true);
    }
  });

  it('rejects activeHourStart out of 0..23', () => {
    expect(validateCreateGroupInput({ ...valid, activeHourStart: -1 }).ok).toBe(false);
    expect(validateCreateGroupInput({ ...valid, activeHourStart: 24 }).ok).toBe(false);
  });

  it('rejects activeHourEnd out of 0..23', () => {
    expect(validateCreateGroupInput({ ...valid, activeHourEnd: -1 }).ok).toBe(false);
    expect(validateCreateGroupInput({ ...valid, activeHourEnd: 24 }).ok).toBe(false);
  });

  it('rejects when start >= end', () => {
    expect(validateCreateGroupInput({ ...valid, activeHourStart: 12, activeHourEnd: 12 }).ok).toBe(
      false,
    );
    expect(validateCreateGroupInput({ ...valid, activeHourStart: 22, activeHourEnd: 9 }).ok).toBe(
      false,
    );
  });

  it('rejects non-integer hours', () => {
    expect(validateCreateGroupInput({ ...valid, activeHourStart: 9.5 }).ok).toBe(false);
    expect(validateCreateGroupInput({ ...valid, activeHourEnd: 22.5 }).ok).toBe(false);
  });

  it('accumulates failing fields', () => {
    const r = validateCreateGroupInput({
      name: '',
      timezone: 'invalid',
      activeHourStart: 30,
      activeHourEnd: 40,
    });
    if (r.ok || r.error.code !== 'VALIDATION_FAILED') {
      throw new Error('expected VALIDATION_FAILED');
    }
    const fields = r.error.details['fields'] as readonly string[];
    expect(new Set(fields)).toEqual(
      new Set(['name', 'timezone', 'activeHourStart', 'activeHourEnd']),
    );
  });
});
