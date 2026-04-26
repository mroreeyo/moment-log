import { describe, it, expect } from '@jest/globals';
import { assignSlotByRecordingStart, type CandidateSlot } from './slot-assignment.js';

const slots: readonly CandidateSlot[] = [
  {
    promptId: 'slot-11',
    slotStartsAt: '2026-04-24T11:00:00.000Z',
    slotEndsAt: '2026-04-24T12:00:00.000Z',
  },
  {
    promptId: 'slot-12',
    slotStartsAt: '2026-04-24T12:00:00.000Z',
    slotEndsAt: '2026-04-24T13:00:00.000Z',
  },
];

describe('assignSlotByRecordingStart — PRD §8.4.1', () => {
  it('selects slot when recordingStartedAt is exactly at slotStartsAt', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T12:00:00.000Z',
      candidates: slots,
    });
    expect(r).toEqual({ ok: true, promptId: 'slot-12' });
  });

  it('selects slot when recordingStartedAt is mid-slot', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T12:30:00.000Z',
      candidates: slots,
    });
    expect(r).toEqual({ ok: true, promptId: 'slot-12' });
  });

  it('selects slot when recordingStartedAt is 1ms before slotEndsAt', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T12:59:59.999Z',
      candidates: slots,
    });
    expect(r).toEqual({ ok: true, promptId: 'slot-12' });
  });

  it('assigns the later slot when recordingStartedAt is exactly at slotEndsAt (half-open boundary [start, end))', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T12:00:00.000Z',
      candidates: slots,
    });
    expect(r).toEqual({ ok: true, promptId: 'slot-12' });
  });

  it('returns MISMATCH when recordingStartedAt is before all slots', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T10:30:00.000Z',
      candidates: slots,
    });
    expect(r).toEqual({ ok: false, reason: 'NO_MATCHING_SLOT' });
  });

  it('returns MISMATCH when recordingStartedAt is after all slots', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T13:30:00.000Z',
      candidates: slots,
    });
    expect(r).toEqual({ ok: false, reason: 'NO_MATCHING_SLOT' });
  });

  it('returns MISMATCH when candidates is empty', () => {
    const r = assignSlotByRecordingStart({
      recordingStartedAt: '2026-04-24T12:00:00.000Z',
      candidates: [],
    });
    expect(r).toEqual({ ok: false, reason: 'NO_MATCHING_SLOT' });
  });

  it('throws on invalid recordingStartedAt', () => {
    expect(() =>
      assignSlotByRecordingStart({
        recordingStartedAt: 'nope',
        candidates: slots,
      }),
    ).toThrow(/invalid recordingStartedAt/i);
  });

  it('throws on invalid candidate slotStartsAt', () => {
    expect(() =>
      assignSlotByRecordingStart({
        recordingStartedAt: '2026-04-24T12:00:00.000Z',
        candidates: [{ promptId: 'x', slotStartsAt: 'bad', slotEndsAt: 'bad' }],
      }),
    ).toThrow(/invalid candidate/i);
  });
});
