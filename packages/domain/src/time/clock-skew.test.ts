import { describe, it, expect } from '@jest/globals';
import { detectClockSkew, CLOCK_SKEW_TOLERANCE_MS } from './clock-skew.js';

describe('detectClockSkew — PRD §8.4.1 (±5분 허용)', () => {
  const server = '2026-04-24T12:00:00.000Z';

  it('returns skewed=false when client and server are identical', () => {
    const result = detectClockSkew({ clientTime: server, serverTime: server });
    expect(result).toEqual({ skewed: false, skewMs: 0 });
  });

  it('accepts client +4:59 (within tolerance)', () => {
    const client = '2026-04-24T12:04:59.000Z';
    const { skewed } = detectClockSkew({ clientTime: client, serverTime: server });
    expect(skewed).toBe(false);
  });

  it('accepts client -4:59 (within tolerance)', () => {
    const client = '2026-04-24T11:55:01.000Z';
    const { skewed } = detectClockSkew({ clientTime: client, serverTime: server });
    expect(skewed).toBe(false);
  });

  it('accepts exactly at boundary of 5 minutes', () => {
    const client = '2026-04-24T12:05:00.000Z';
    const { skewed } = detectClockSkew({ clientTime: client, serverTime: server });
    expect(skewed).toBe(false);
  });

  it('rejects client +6 minutes (beyond tolerance)', () => {
    const client = '2026-04-24T12:06:00.000Z';
    const { skewed, skewMs } = detectClockSkew({ clientTime: client, serverTime: server });
    expect(skewed).toBe(true);
    expect(skewMs).toBe(6 * 60 * 1000);
  });

  it('rejects client -6 minutes (beyond tolerance)', () => {
    const client = '2026-04-24T11:54:00.000Z';
    const { skewed, skewMs } = detectClockSkew({ clientTime: client, serverTime: server });
    expect(skewed).toBe(true);
    expect(skewMs).toBe(-6 * 60 * 1000);
  });

  it('uses custom toleranceMs when provided', () => {
    const client = '2026-04-24T12:01:00.000Z';
    const result = detectClockSkew({
      clientTime: client,
      serverTime: server,
      toleranceMs: 30 * 1000,
    });
    expect(result.skewed).toBe(true);
    expect(result.skewMs).toBe(60 * 1000);
  });

  it('exposes CLOCK_SKEW_TOLERANCE_MS as 5 minutes', () => {
    expect(CLOCK_SKEW_TOLERANCE_MS).toBe(5 * 60 * 1000);
  });

  it('throws on invalid clientTime', () => {
    expect(() => detectClockSkew({ clientTime: 'bad', serverTime: server })).toThrow(
      /invalid clientTime/i,
    );
  });

  it('throws on invalid serverTime', () => {
    expect(() => detectClockSkew({ clientTime: server, serverTime: 'bad' })).toThrow(
      /invalid serverTime/i,
    );
  });
});
