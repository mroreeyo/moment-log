import { describe, it, expect } from '@jest/globals';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_MS,
  generateInviteCode,
  isValidInviteCode,
} from './invite-code.js';

describe('invite code constants', () => {
  it('INVITE_CODE_LENGTH = 8', () => {
    expect(INVITE_CODE_LENGTH).toBe(8);
  });

  it('INVITE_TTL_MS = 24h', () => {
    expect(INVITE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('INVITE_CODE_ALPHABET excludes confusing chars 0/O/1/I/L', () => {
    const chars = [...INVITE_CODE_ALPHABET];
    expect(chars).not.toContain('0');
    expect(chars).not.toContain('O');
    expect(chars).not.toContain('1');
    expect(chars).not.toContain('I');
    expect(chars).not.toContain('L');
    expect(chars).not.toContain('l');
    for (const c of chars) {
      expect(/[A-Z2-9]/.test(c)).toBe(true);
    }
  });

  it('INVITE_CODE_ALPHABET has unique characters only', () => {
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(INVITE_CODE_ALPHABET.length);
  });
});

describe('generateInviteCode', () => {
  it('produces a code of exactly INVITE_CODE_LENGTH using only the allowed alphabet', () => {
    const randomBytes = (n: number) => new Uint8Array(n).map((_, i) => (i * 17 + 3) & 0xff);
    const code = generateInviteCode(randomBytes);
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    for (const c of code) {
      expect(INVITE_CODE_ALPHABET).toContain(c);
    }
  });

  it('is deterministic for a given randomBytes source', () => {
    const rb = (n: number) => new Uint8Array(n).map((_, i) => (i * 5 + 1) & 0xff);
    expect(generateInviteCode(rb)).toBe(generateInviteCode(rb));
  });

  it('produces different outputs for different byte sources', () => {
    const a = generateInviteCode((n) => new Uint8Array(n).map((_, i) => i));
    const b = generateInviteCode((n) => new Uint8Array(n).map((_, i) => i + 128));
    expect(a).not.toBe(b);
  });

  it('throws when randomBytes returns too few bytes', () => {
    const broken = () => new Uint8Array(3);
    expect(() => generateInviteCode(broken)).toThrow(/randomBytes/i);
  });
});

describe('isValidInviteCode', () => {
  it('accepts well-formed 8-char alphabet codes', () => {
    expect(isValidInviteCode('ABCD2345')).toBe(true);
    expect(isValidInviteCode('ZZZZ9999')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidInviteCode('ABCD234')).toBe(false);
    expect(isValidInviteCode('ABCD23456')).toBe(false);
    expect(isValidInviteCode('')).toBe(false);
  });

  it('rejects confusing characters', () => {
    expect(isValidInviteCode('ABCD2340')).toBe(false);
    expect(isValidInviteCode('ABCD234O')).toBe(false);
    expect(isValidInviteCode('ABCD2341')).toBe(false);
    expect(isValidInviteCode('ABCD234I')).toBe(false);
    expect(isValidInviteCode('ABCD234L')).toBe(false);
  });

  it('rejects lowercase and symbols', () => {
    expect(isValidInviteCode('abcd2345')).toBe(false);
    expect(isValidInviteCode('ABCD-345')).toBe(false);
    expect(isValidInviteCode('ABCD 345')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidInviteCode(null as unknown as string)).toBe(false);
    expect(isValidInviteCode(undefined as unknown as string)).toBe(false);
    expect(isValidInviteCode(12345678 as unknown as string)).toBe(false);
  });
});
