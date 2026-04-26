import { describe, it, expect } from '@jest/globals';
import { assertNever } from './assert-never.js';

describe('assertNever', () => {
  it('throws with the unexpected value serialized', () => {
    const unreachable = 'rogue' as unknown as never;

    expect(() => assertNever(unreachable)).toThrow(/Non-exhaustive match/);
    expect(() => assertNever(unreachable)).toThrow(/"rogue"/);
  });

  it('throws for object values as well', () => {
    const unreachable = { kind: 'mystery' } as unknown as never;

    expect(() => assertNever(unreachable)).toThrow(/"kind":"mystery"/);
  });
});
