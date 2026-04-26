import { assertNever } from '../shared/assert-never.js';

export type VlogState =
  | { readonly status: 'skipped'; readonly outcome: 'empty' }
  | { readonly status: 'skipped'; readonly outcome: 'skipped_single' }
  | { readonly status: 'pending' }
  | { readonly status: 'processing' }
  | { readonly status: 'done'; readonly outcome: 'compiled' }
  | { readonly status: 'failed'; readonly outcome: 'failed' }
  | { readonly status: 'failed'; readonly outcome: 'expired' };

export type VlogEvent =
  | { readonly type: 'CLOSE_EMPTY' }
  | { readonly type: 'CLOSE_SINGLE' }
  | { readonly type: 'CLOSE_MULTI' }
  | { readonly type: 'WORKER_START' }
  | { readonly type: 'WORKER_DONE' }
  | { readonly type: 'WORKER_FAIL' }
  | { readonly type: 'RETRY' }
  | { readonly type: 'RAW_EXPIRED' };

const EMPTY: VlogState = { status: 'skipped', outcome: 'empty' };
const SINGLE: VlogState = { status: 'skipped', outcome: 'skipped_single' };
const PENDING: VlogState = { status: 'pending' };
const PROCESSING: VlogState = { status: 'processing' };
const COMPILED: VlogState = { status: 'done', outcome: 'compiled' };
const FAILED: VlogState = { status: 'failed', outcome: 'failed' };
const EXPIRED: VlogState = { status: 'failed', outcome: 'expired' };

export const transition = (state: VlogState, event: VlogEvent): VlogState => {
  switch (state.status) {
    case 'skipped':
      return state;

    case 'pending':
      switch (event.type) {
        case 'CLOSE_EMPTY':
          return EMPTY;
        case 'CLOSE_SINGLE':
          return SINGLE;
        case 'CLOSE_MULTI':
          return PENDING;
        case 'WORKER_START':
          return PROCESSING;
        case 'WORKER_DONE':
        case 'WORKER_FAIL':
        case 'RETRY':
        case 'RAW_EXPIRED':
          return state;
        /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
        default:
          return assertNever(event);
      }

    case 'processing':
      switch (event.type) {
        case 'WORKER_DONE':
          return COMPILED;
        case 'WORKER_FAIL':
          return FAILED;
        case 'CLOSE_EMPTY':
        case 'CLOSE_SINGLE':
        case 'CLOSE_MULTI':
        case 'WORKER_START':
        case 'RETRY':
        case 'RAW_EXPIRED':
          return state;
        /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
        default:
          return assertNever(event);
      }

    case 'done':
      return state;

    case 'failed':
      if (state.outcome === 'expired') {
        return state;
      }
      switch (event.type) {
        case 'RETRY':
          return PENDING;
        case 'RAW_EXPIRED':
          return EXPIRED;
        case 'CLOSE_EMPTY':
        case 'CLOSE_SINGLE':
        case 'CLOSE_MULTI':
        case 'WORKER_START':
        case 'WORKER_DONE':
        case 'WORKER_FAIL':
          return state;
        /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
        default:
          return assertNever(event);
      }

    /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
    default:
      return assertNever(state);
  }
};
