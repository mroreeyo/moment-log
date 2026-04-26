import { describe, test, expect } from '@jest/globals';
import { toUserFacingStatus, type UserFacingSlotStatus } from './display.js';
import type { VlogState } from './state.js';

describe('vlog user-facing status mapping (PRD §8.5.1)', () => {
  const cases: ReadonlyArray<{
    readonly label: string;
    readonly state: VlogState;
    readonly rawExists: boolean;
    readonly expected: UserFacingSlotStatus;
  }> = [
    {
      label: '0 clips closed → empty',
      state: { status: 'skipped', outcome: 'empty' },
      rawExists: false,
      expected: 'empty',
    },
    {
      label: '1 clip closed → raw_only',
      state: { status: 'skipped', outcome: 'skipped_single' },
      rawExists: true,
      expected: 'raw_only',
    },
    {
      label: 'pending → processing',
      state: { status: 'pending' },
      rawExists: true,
      expected: 'processing',
    },
    {
      label: 'processing → processing',
      state: { status: 'processing' },
      rawExists: true,
      expected: 'processing',
    },
    {
      label: 'done compiled → compiled',
      state: { status: 'done', outcome: 'compiled' },
      rawExists: false,
      expected: 'compiled',
    },
    {
      label: 'failed with raw present → failed',
      state: { status: 'failed', outcome: 'failed' },
      rawExists: true,
      expected: 'failed',
    },
    {
      label: 'failed with raw already expired → expired',
      state: { status: 'failed', outcome: 'failed' },
      rawExists: false,
      expected: 'expired',
    },
    {
      label: 'failed with outcome=expired (terminal) → expired regardless of rawExists',
      state: { status: 'failed', outcome: 'expired' },
      rawExists: true,
      expected: 'expired',
    },
  ];

  test.each(cases)('$label', ({ state, rawExists, expected }) => {
    expect(toUserFacingStatus(state, { rawExists })).toBe(expected);
  });

  describe('retry eligibility', () => {
    test.each<{
      label: string;
      state: VlogState;
      rawExists: boolean;
      canRetry: boolean;
    }>([
      {
        label: 'failed + raw present → can retry',
        state: { status: 'failed', outcome: 'failed' },
        rawExists: true,
        canRetry: true,
      },
      {
        label: 'failed + raw expired → cannot retry',
        state: { status: 'failed', outcome: 'failed' },
        rawExists: false,
        canRetry: false,
      },
      {
        label: 'failed + outcome=expired → cannot retry',
        state: { status: 'failed', outcome: 'expired' },
        rawExists: true,
        canRetry: false,
      },
      {
        label: 'compiled → cannot retry',
        state: { status: 'done', outcome: 'compiled' },
        rawExists: true,
        canRetry: false,
      },
      {
        label: 'processing → cannot retry (already in flight)',
        state: { status: 'processing' },
        rawExists: true,
        canRetry: false,
      },
      {
        label: 'pending → cannot retry (not yet failed)',
        state: { status: 'pending' },
        rawExists: true,
        canRetry: false,
      },
      {
        label: 'skipped empty → cannot retry',
        state: { status: 'skipped', outcome: 'empty' },
        rawExists: false,
        canRetry: false,
      },
      {
        label: 'skipped single → cannot retry',
        state: { status: 'skipped', outcome: 'skipped_single' },
        rawExists: true,
        canRetry: false,
      },
    ])('$label', ({ state, rawExists, canRetry }) => {
      const { canRetry: actual } = toUserFacingStatus.decide(state, { rawExists });
      expect(actual).toBe(canRetry);
    });
  });
});
