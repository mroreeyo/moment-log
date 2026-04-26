import { assertNever } from '../shared/assert-never.ts';
import type { VlogState } from './state.ts';

export type UserFacingSlotStatus =
  | 'empty'
  | 'raw_only'
  | 'processing'
  | 'compiled'
  | 'failed'
  | 'expired';

export interface ToUserFacingStatusContext {
  readonly rawExists: boolean;
}

export interface UserFacingDecision {
  readonly status: UserFacingSlotStatus;
  readonly canRetry: boolean;
}

const decide = (state: VlogState, ctx: ToUserFacingStatusContext): UserFacingDecision => {
  switch (state.status) {
    case 'skipped':
      switch (state.outcome) {
        case 'empty':
          return { status: 'empty', canRetry: false };
        case 'skipped_single':
          return { status: 'raw_only', canRetry: false };
        /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
        default:
          return assertNever(state);
      }

    case 'pending':
    case 'processing':
      return { status: 'processing', canRetry: false };

    case 'done':
      return { status: 'compiled', canRetry: false };

    case 'failed':
      if (state.outcome === 'expired') {
        return { status: 'expired', canRetry: false };
      }
      if (!ctx.rawExists) {
        return { status: 'expired', canRetry: false };
      }
      return { status: 'failed', canRetry: true };

    /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
    default:
      return assertNever(state);
  }
};

type ToUserFacingStatusFn = {
  (state: VlogState, ctx: ToUserFacingStatusContext): UserFacingSlotStatus;
  readonly decide: typeof decide;
};

export const toUserFacingStatus: ToUserFacingStatusFn = Object.assign(
  (state: VlogState, ctx: ToUserFacingStatusContext): UserFacingSlotStatus =>
    decide(state, ctx).status,
  { decide },
);
