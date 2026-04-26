import { describe, it, expect } from '@jest/globals';
import { loadEnv, missingVars, type EnvSpec } from './loader.js';

describe('loadEnv', () => {
  const spec = {
    SUPABASE_URL: { kind: 'string' },
    SUPABASE_ANON_KEY: { kind: 'string' },
    MAX_RETRIES: { kind: 'number', default: 3 },
    ENABLE_FLAG: { kind: 'boolean', default: false },
  } satisfies EnvSpec;

  it('loads strings', () => {
    const env = loadEnv(spec, {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    });
    expect(env.SUPABASE_URL).toBe('https://x.supabase.co');
    expect(env.SUPABASE_ANON_KEY).toBe('anon');
  });

  it('applies defaults for optional values', () => {
    const env = loadEnv(spec, {
      SUPABASE_URL: 'u',
      SUPABASE_ANON_KEY: 'k',
    });
    expect(env.MAX_RETRIES).toBe(3);
    expect(env.ENABLE_FLAG).toBe(false);
  });

  it('parses number values from strings', () => {
    const env = loadEnv(spec, {
      SUPABASE_URL: 'u',
      SUPABASE_ANON_KEY: 'k',
      MAX_RETRIES: '7',
    });
    expect(env.MAX_RETRIES).toBe(7);
  });

  it('parses boolean values (true/false/1/0)', () => {
    for (const [input, expected] of [
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
      ['TRUE', true],
      ['False', false],
    ] as const) {
      const env = loadEnv(spec, {
        SUPABASE_URL: 'u',
        SUPABASE_ANON_KEY: 'k',
        ENABLE_FLAG: input,
      });
      expect(env.ENABLE_FLAG).toBe(expected);
    }
  });

  it('throws with a list of missing required vars', () => {
    expect(() => loadEnv(spec, {})).toThrow(
      /Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY/,
    );
  });

  it('throws for NaN number input', () => {
    expect(() =>
      loadEnv(spec, {
        SUPABASE_URL: 'u',
        SUPABASE_ANON_KEY: 'k',
        MAX_RETRIES: 'not-a-number',
      }),
    ).toThrow(/Invalid number for env var MAX_RETRIES/);
  });

  it('throws for unrecognized boolean', () => {
    expect(() =>
      loadEnv(spec, {
        SUPABASE_URL: 'u',
        SUPABASE_ANON_KEY: 'k',
        ENABLE_FLAG: 'yes',
      }),
    ).toThrow(/Invalid boolean for env var ENABLE_FLAG/);
  });

  it('allows required number/boolean without defaults', () => {
    const s = { RETRIES: { kind: 'number' }, DEBUG: { kind: 'boolean' } } satisfies EnvSpec;
    const env = loadEnv(s, { RETRIES: '5', DEBUG: 'true' });
    expect(env.RETRIES).toBe(5);
    expect(env.DEBUG).toBe(true);
  });

  it('trims whitespace on string values', () => {
    const env = loadEnv(spec, {
      SUPABASE_URL: '  trimmed  ',
      SUPABASE_ANON_KEY: 'k',
    });
    expect(env.SUPABASE_URL).toBe('trimmed');
  });

  it('uses default for optional string when missing', () => {
    const s = {
      HOST: { kind: 'string', default: 'localhost' },
      PORT: { kind: 'number', default: 8080 },
    } satisfies EnvSpec;
    const env = loadEnv(s, {});
    expect(env.HOST).toBe('localhost');
    expect(env.PORT).toBe(8080);
  });

  it('treats empty string as missing', () => {
    expect(() => loadEnv(spec, { SUPABASE_URL: '', SUPABASE_ANON_KEY: '  ' })).toThrow(
      /Missing required env vars/,
    );
  });
});

describe('missingVars', () => {
  it('returns list of unset required keys', () => {
    const spec = { A: { kind: 'string' }, B: { kind: 'string', default: 'x' } } satisfies EnvSpec;
    expect(missingVars(spec, {})).toEqual(['A']);
    expect(missingVars(spec, { A: 'v' })).toEqual([]);
    expect(missingVars(spec, { A: '  ' })).toEqual(['A']);
  });
});
