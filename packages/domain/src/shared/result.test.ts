import { describe, it, expect } from '@jest/globals';
import { ok, err, isOk, isErr, mapResult, mapResultErr, type Result } from './result.js';

describe('Result', () => {
  describe('ok / err constructors', () => {
    it('ok wraps value with ok=true', () => {
      const r = ok(42);
      expect(r).toEqual({ ok: true, value: 42 });
    });

    it('err wraps error with ok=false', () => {
      const r = err('boom');
      expect(r).toEqual({ ok: false, error: 'boom' });
    });
  });

  describe('isOk / isErr', () => {
    it('isOk returns true for ok results', () => {
      expect(isOk(ok(1))).toBe(true);
      expect(isOk(err('e'))).toBe(false);
    });

    it('isErr returns true for err results', () => {
      expect(isErr(err('e'))).toBe(true);
      expect(isErr(ok(1))).toBe(false);
    });
  });

  describe('mapResult', () => {
    it('maps success value', () => {
      const r = mapResult(ok(2), (n) => n * 3);
      expect(r).toEqual({ ok: true, value: 6 });
    });

    it('leaves error untouched', () => {
      const r: Result<number, string> = err('fail');
      const mapped = mapResult(r, (n) => n * 3);
      expect(mapped).toEqual({ ok: false, error: 'fail' });
    });
  });

  describe('mapResultErr', () => {
    it('maps error value', () => {
      const r: Result<number, string> = err('fail');
      const mapped = mapResultErr(r, (e) => `wrapped:${e}`);
      expect(mapped).toEqual({ ok: false, error: 'wrapped:fail' });
    });

    it('leaves success untouched', () => {
      const r = mapResultErr(ok(5), (e: string) => `wrapped:${e}`);
      expect(r).toEqual({ ok: true, value: 5 });
    });
  });
});
