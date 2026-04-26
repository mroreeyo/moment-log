import { describe, it, expect } from '@jest/globals';
import {
  GRACE_WINDOW_MIN,
  computeSlotWindow,
  isWithinGraceWindow,
  type SlotWindow,
} from './grace-window.js';

describe('GRACE_WINDOW_MIN', () => {
  it('is exactly 15 minutes per PRD §8.4', () => {
    expect(GRACE_WINDOW_MIN).toBe(15);
  });
});

describe('computeSlotWindow', () => {
  it('derives slotEndsAt = slotStartsAt + 1 hour and graceEndsAt = slotEndsAt + 15min', () => {
    const w: SlotWindow = computeSlotWindow({ slotStartsAt: '2026-04-24T12:00:00.000Z' });
    expect(w.slotStartsAt).toBe('2026-04-24T12:00:00.000Z');
    expect(w.slotEndsAt).toBe('2026-04-24T13:00:00.000Z');
    expect(w.graceEndsAt).toBe('2026-04-24T13:15:00.000Z');
  });

  it('respects custom slotDurationMin', () => {
    const w = computeSlotWindow({
      slotStartsAt: '2026-04-24T12:00:00.000Z',
      slotDurationMin: 30,
    });
    expect(w.slotEndsAt).toBe('2026-04-24T12:30:00.000Z');
    expect(w.graceEndsAt).toBe('2026-04-24T12:45:00.000Z');
  });

  it('respects custom graceDurationMin', () => {
    const w = computeSlotWindow({
      slotStartsAt: '2026-04-24T12:00:00.000Z',
      graceDurationMin: 5,
    });
    expect(w.slotEndsAt).toBe('2026-04-24T13:00:00.000Z');
    expect(w.graceEndsAt).toBe('2026-04-24T13:05:00.000Z');
  });

  it('throws on invalid slotStartsAt', () => {
    expect(() => computeSlotWindow({ slotStartsAt: 'not-a-date' })).toThrow(
      /invalid slotStartsAt/i,
    );
  });
});

describe('isWithinGraceWindow — PRD §8.4 (slot_end + 15분)', () => {
  const graceEndsAt = '2026-04-24T13:15:00.000Z';

  it('accepts finalizeAt 1ms before grace end', () => {
    expect(isWithinGraceWindow({ finalizeAt: '2026-04-24T13:14:59.999Z', graceEndsAt })).toBe(true);
  });

  it('accepts finalizeAt exactly at grace end (inclusive boundary)', () => {
    expect(isWithinGraceWindow({ finalizeAt: '2026-04-24T13:15:00.000Z', graceEndsAt })).toBe(true);
  });

  it('rejects finalizeAt 1ms after grace end (exclusive beyond)', () => {
    expect(isWithinGraceWindow({ finalizeAt: '2026-04-24T13:15:00.001Z', graceEndsAt })).toBe(
      false,
    );
  });

  it('accepts finalizeAt earlier than slot end', () => {
    expect(isWithinGraceWindow({ finalizeAt: '2026-04-24T12:30:00.000Z', graceEndsAt })).toBe(true);
  });

  it('throws on invalid finalizeAt', () => {
    expect(() => isWithinGraceWindow({ finalizeAt: 'nope', graceEndsAt })).toThrow(
      /invalid finalizeAt/i,
    );
  });

  it('throws on invalid graceEndsAt', () => {
    expect(() => isWithinGraceWindow({ finalizeAt: graceEndsAt, graceEndsAt: 'nope' })).toThrow(
      /invalid graceEndsAt/i,
    );
  });
});
