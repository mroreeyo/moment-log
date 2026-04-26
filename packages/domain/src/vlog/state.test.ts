import { describe, it, expect, test } from '@jest/globals';
import { transition, type VlogState, type VlogEvent } from './state.js';

const S = {
  emptyClosed: { status: 'skipped', outcome: 'empty' } as const,
  singleRaw: { status: 'skipped', outcome: 'skipped_single' } as const,
  pending: { status: 'pending' } as const,
  processing: { status: 'processing' } as const,
  compiled: { status: 'done', outcome: 'compiled' } as const,
  failed: { status: 'failed', outcome: 'failed' } as const,
  expired: { status: 'failed', outcome: 'expired' } as const,
} satisfies Record<string, VlogState>;

const E = {
  closeEmpty: { type: 'CLOSE_EMPTY' } as const,
  closeSingle: { type: 'CLOSE_SINGLE' } as const,
  closeMulti: { type: 'CLOSE_MULTI' } as const,
  workerStart: { type: 'WORKER_START' } as const,
  workerDone: { type: 'WORKER_DONE' } as const,
  workerFail: { type: 'WORKER_FAIL' } as const,
  retry: { type: 'RETRY' } as const,
  rawExpired: { type: 'RAW_EXPIRED' } as const,
} satisfies Record<string, VlogEvent>;

describe('vlog state machine — PRD §8.5.1', () => {
  describe('initial close transitions (from hourly tick)', () => {
    test.each<{ name: string; from: VlogState; event: VlogEvent; to: VlogState }>([
      { name: '0 uploads → empty', from: S.pending, event: E.closeEmpty, to: S.emptyClosed },
      { name: '1 upload  → single', from: S.pending, event: E.closeSingle, to: S.singleRaw },
      {
        name: '2+ uploads stay pending (worker will pick up)',
        from: S.pending,
        event: E.closeMulti,
        to: S.pending,
      },
    ])('$name', ({ from, event, to }) => {
      expect(transition(from, event)).toEqual(to);
    });
  });

  describe('worker transitions', () => {
    test.each<{ name: string; from: VlogState; event: VlogEvent; to: VlogState }>([
      {
        name: 'pending → processing on WORKER_START',
        from: S.pending,
        event: E.workerStart,
        to: S.processing,
      },
      {
        name: 'processing → compiled on WORKER_DONE',
        from: S.processing,
        event: E.workerDone,
        to: S.compiled,
      },
      {
        name: 'processing → failed on WORKER_FAIL',
        from: S.processing,
        event: E.workerFail,
        to: S.failed,
      },
    ])('$name', ({ from, event, to }) => {
      expect(transition(from, event)).toEqual(to);
    });
  });

  describe('retry transitions (PRD §8.7)', () => {
    it('failed → pending on RETRY (raw still present)', () => {
      expect(transition(S.failed, E.retry)).toEqual(S.pending);
    });

    it('failed → expired on RAW_EXPIRED', () => {
      expect(transition(S.failed, E.rawExpired)).toEqual(S.expired);
    });

    it('expired is terminal — RETRY does not revive it', () => {
      expect(transition(S.expired, E.retry)).toEqual(S.expired);
    });
  });

  describe('terminal immutability', () => {
    test.each<{ state: VlogState; label: string }>([
      { state: S.emptyClosed, label: 'empty' },
      { state: S.singleRaw, label: 'skipped_single' },
      { state: S.compiled, label: 'compiled' },
      { state: S.expired, label: 'expired' },
    ])('$label is terminal — any event returns same state', ({ state }) => {
      for (const event of Object.values(E)) {
        expect(transition(state, event)).toEqual(state);
      }
    });
  });

  describe('illegal transitions are no-ops (not exceptions)', () => {
    test.each<{ name: string; from: VlogState; event: VlogEvent }>([
      { name: 'pending cannot accept WORKER_DONE', from: S.pending, event: E.workerDone },
      { name: 'processing cannot accept CLOSE_EMPTY', from: S.processing, event: E.closeEmpty },
      { name: 'processing cannot accept RETRY', from: S.processing, event: E.retry },
      { name: 'failed cannot accept WORKER_DONE', from: S.failed, event: E.workerDone },
    ])('$name → state unchanged', ({ from, event }) => {
      expect(transition(from, event)).toEqual(from);
    });
  });

  describe('exhaustiveness (compile-time guarantee, runtime sanity)', () => {
    it('handles every state × event combination without throwing', () => {
      const states: VlogState[] = Object.values(S);
      const events: VlogEvent[] = Object.values(E);
      for (const state of states) {
        for (const event of events) {
          expect(() => transition(state, event)).not.toThrow();
        }
      }
    });
  });
});
