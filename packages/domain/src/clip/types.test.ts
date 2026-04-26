import { describe, it, expect } from '@jest/globals';
import { buildRawStoragePath } from './types.js';

describe('buildRawStoragePath', () => {
  it('builds canonical path matching PRD §20.1', () => {
    expect(buildRawStoragePath('g1', 'p1', 'u1')).toBe('raw/g1/p1/u1.mp4');
  });

  it('preserves UUID-like input verbatim', () => {
    const g = '123e4567-e89b-12d3-a456-426614174000';
    const p = '00000000-0000-0000-0000-000000000001';
    const u = '00000000-0000-0000-0000-000000000002';
    expect(buildRawStoragePath(g, p, u)).toBe(`raw/${g}/${p}/${u}.mp4`);
  });
});
