import type { DomainError } from '../api/errors.js';

export interface CreateGroupInput {
  readonly name: string;
  readonly timezone: string;
  readonly activeHourStart: number;
  readonly activeHourEnd: number;
}

export type CreateGroupValidation =
  | { readonly ok: true; readonly value: CreateGroupInput }
  | { readonly ok: false; readonly error: DomainError };

const NAME_MAX = 40;

const isIanaTimezone = (tz: string): boolean => {
  if (typeof tz !== 'string') return false;
  if (!tz.includes('/')) return false;
  if (/\s/.test(tz)) return false;
  return /^[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z][A-Za-z0-9_+-]*)?$/.test(tz);
};

const isValidHour = (h: unknown): h is number =>
  typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23;

export const validateCreateGroupInput = (input: CreateGroupInput): CreateGroupValidation => {
  const fields: string[] = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || name.length > NAME_MAX) {
    fields.push('name');
  }
  if (!isIanaTimezone(input.timezone)) {
    fields.push('timezone');
  }
  if (!isValidHour(input.activeHourStart)) {
    fields.push('activeHourStart');
  }
  if (!isValidHour(input.activeHourEnd)) {
    fields.push('activeHourEnd');
  }
  if (fields.length === 0 && input.activeHourStart >= input.activeHourEnd) {
    fields.push('activeHourStart', 'activeHourEnd');
  }
  if (fields.length > 0) {
    return {
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields: Array.from(new Set(fields)) } },
    };
  }
  return {
    ok: true,
    value: {
      name,
      timezone: input.timezone,
      activeHourStart: input.activeHourStart,
      activeHourEnd: input.activeHourEnd,
    },
  };
};
