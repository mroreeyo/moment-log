import { describe, it, expect } from '@jest/globals';
import {
  validateFinalizeBody,
  finalizeSlotDecision,
  type FinalizePromptSnapshot,
} from './finalize-validation.js';

const prompt: FinalizePromptSnapshot = {
  promptId: 'prompt-12',
  groupId: 'g1',
  slotStartsAt: '2026-04-24T12:00:00.000Z',
  slotEndsAt: '2026-04-24T13:00:00.000Z',
  graceEndsAt: '2026-04-24T13:15:00.000Z',
  status: 'open',
};

const now = new Date('2026-04-24T12:10:00.000Z');

describe('validateFinalizeBody', () => {
  const valid = {
    promptId: 'prompt-12',
    recordingStartedAt: '2026-04-24T12:05:00.000Z',
    fileSizeBytes: 2_000_000,
  };

  it('accepts a valid body', () => {
    expect(validateFinalizeBody(valid).ok).toBe(true);
  });

  it('rejects missing promptId', () => {
    const r = validateFinalizeBody({ ...valid, promptId: '' });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid recordingStartedAt format', () => {
    const r = validateFinalizeBody({ ...valid, recordingStartedAt: 'nope' });
    expect(r.ok).toBe(false);
  });

  it('rejects zero / negative / non-integer fileSizeBytes', () => {
    expect(validateFinalizeBody({ ...valid, fileSizeBytes: 0 }).ok).toBe(false);
    expect(validateFinalizeBody({ ...valid, fileSizeBytes: -5 }).ok).toBe(false);
    expect(validateFinalizeBody({ ...valid, fileSizeBytes: 1.5 }).ok).toBe(false);
  });

  it('rejects fileSizeBytes above 10 MiB', () => {
    expect(validateFinalizeBody({ ...valid, fileSizeBytes: 11 * 1024 * 1024 }).ok).toBe(false);
  });

  it('accumulates multiple field failures', () => {
    const r = validateFinalizeBody({
      promptId: '',
      recordingStartedAt: 'bad',
      fileSizeBytes: -1,
    });
    if (r.ok || r.error.code !== 'VALIDATION_FAILED') {
      throw new Error('expected VALIDATION_FAILED');
    }
    const fields = r.error.details['fields'] as readonly string[];
    expect(new Set(fields)).toEqual(new Set(['promptId', 'recordingStartedAt', 'fileSizeBytes']));
  });
});

describe('finalizeSlotDecision', () => {
  it('accepts recording within slot, now within grace', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T12:05:00.000Z',
      now,
      prompt,
    });
    if (!d.ok) throw new Error('expected ok');
    expect(d.isLate).toBe(false);
  });

  it('rejects SLOT_CLOSED when prompt.status=closed', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T12:05:00.000Z',
      now,
      prompt: { ...prompt, status: 'closed' },
    });
    if (d.ok) throw new Error('expected error');
    expect(d.error.code).toBe('SLOT_CLOSED');
  });

  it('rejects CLOCK_SKEW when client time > 5 min ahead of server', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T12:16:00.000Z',
      now,
      prompt,
    });
    if (d.ok) throw new Error('expected error');
    expect(d.error.code).toBe('CLOCK_SKEW');
  });

  it('rejects CLOCK_SKEW when client time > 5 min behind server', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T12:04:00.000Z',
      now: new Date('2026-04-24T12:10:00.000Z'),
      prompt,
    });
    if (d.ok) throw new Error('expected error');
    expect(d.error.code).toBe('CLOCK_SKEW');
  });

  it('rejects PROMPT_MISMATCH when recording falls before slot window (skew-safe)', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T11:55:00.000Z',
      now: new Date('2026-04-24T11:55:30.000Z'),
      prompt,
    });
    if (d.ok) throw new Error('expected error');
    expect(d.error.code).toBe('PROMPT_MISMATCH');
  });

  it('rejects SLOT_CLOSED when now > grace_ends_at (recording close to now)', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T13:14:59.000Z',
      now: new Date('2026-04-24T13:15:00.001Z'),
      prompt,
    });
    if (d.ok) throw new Error('expected error');
    expect(d.error.code).toBe('SLOT_CLOSED');
  });

  it('accepts now exactly at grace boundary (recording close to now)', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T13:14:59.000Z',
      now: new Date('2026-04-24T13:15:00.000Z'),
      prompt,
    });
    expect(d.ok).toBe(true);
  });

  it('recording in last second of slot with now just after → is_late=false, accepted', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T12:59:59.000Z',
      now: new Date('2026-04-24T13:00:05.000Z'),
      prompt,
    });
    if (!d.ok) throw new Error('expected ok');
    expect(d.isLate).toBe(false);
  });

  it('recording exactly at slot end is not late per Task 18 > slot_ends_at rule', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T13:00:00.000Z',
      now: new Date('2026-04-24T13:00:30.000Z'),
      prompt,
    });
    if (!d.ok) throw new Error('expected ok');
    expect(d.isLate).toBe(false);
  });

  it('marks is_late=true when recording after slot_ends_at but within skew & grace', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T13:05:00.000Z',
      now: new Date('2026-04-24T13:06:00.000Z'),
      prompt,
    });
    if (!d.ok) throw new Error('expected ok');
    expect(d.isLate).toBe(true);
  });

  it('SLOT_CLOSED when now past grace, regardless of recording timing', () => {
    const d = finalizeSlotDecision({
      recordingStartedAt: '2026-04-24T13:16:00.000Z',
      now: new Date('2026-04-24T13:17:00.000Z'),
      prompt,
    });
    if (d.ok) throw new Error('expected error');
    expect(['PROMPT_MISMATCH', 'SLOT_CLOSED']).toContain(d.error.code);
  });

  it('throws on invalid recordingStartedAt ISO', () => {
    expect(() =>
      finalizeSlotDecision({
        recordingStartedAt: 'bad',
        now,
        prompt,
      }),
    ).toThrow(/recordingStartedAt/);
  });

  it('throws on invalid prompt.slotStartsAt ISO', () => {
    expect(() =>
      finalizeSlotDecision({
        recordingStartedAt: '2026-04-24T12:05:00.000Z',
        now,
        prompt: { ...prompt, slotStartsAt: 'nope' },
      }),
    ).toThrow(/slotStartsAt/);
  });
});
