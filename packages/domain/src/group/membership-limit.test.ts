import { describe, it, expect } from '@jest/globals';
import { MAX_GROUP_MEMBERS, canAddMember } from './membership-limit.js';

describe('MAX_GROUP_MEMBERS', () => {
  it('is exactly 4 per PRD §8.1', () => {
    expect(MAX_GROUP_MEMBERS).toBe(4);
  });
});

describe('canAddMember', () => {
  it('allows when current < max', () => {
    expect(canAddMember({ currentMemberCount: 3 })).toEqual({ ok: true });
    expect(canAddMember({ currentMemberCount: 0 })).toEqual({ ok: true });
  });

  it('rejects when current = max', () => {
    const r = canAddMember({ currentMemberCount: 4 });
    if (r.ok) throw new Error('expected block');
    expect(r.reason).toBe('GROUP_FULL');
  });

  it('rejects when current > max (already over — should not happen, but defensive)', () => {
    const r = canAddMember({ currentMemberCount: 5 });
    expect(r.ok).toBe(false);
  });

  it('rejects on negative count', () => {
    const r = canAddMember({ currentMemberCount: -1 });
    expect(r.ok).toBe(false);
  });

  it('rejects on non-integer count', () => {
    const r = canAddMember({ currentMemberCount: 3.5 });
    expect(r.ok).toBe(false);
  });
});
