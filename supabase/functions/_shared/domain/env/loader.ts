import { assertNever } from '../shared/assert-never.ts';

export type EnvVarDescriptor =
  | { readonly kind: 'string'; readonly default?: string }
  | { readonly kind: 'number'; readonly default?: number }
  | { readonly kind: 'boolean'; readonly default?: boolean };

export type EnvSpec = Readonly<Record<string, EnvVarDescriptor>>;

type InferValue<D extends EnvVarDescriptor> = D extends { kind: 'string' }
  ? string
  : D extends { kind: 'number' }
    ? number
    : D extends { kind: 'boolean' }
      ? boolean
      : never;

export type LoadedEnv<S extends EnvSpec> = {
  readonly [K in keyof S]: InferValue<S[K]>;
};

export type RawEnvSource = Readonly<Record<string, string | undefined>>;

const isEmpty = (v: string | undefined): boolean => v === undefined || v.trim() === '';

export const missingVars = (spec: EnvSpec, source: RawEnvSource): readonly string[] =>
  Object.entries(spec)
    .filter(([key, desc]) => desc.default === undefined && isEmpty(source[key]))
    .map(([key]) => key);

export const loadEnv = <S extends EnvSpec>(spec: S, source: RawEnvSource): LoadedEnv<S> => {
  const missing = missingVars(spec, source);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  const out: Record<string, string | number | boolean> = {};
  for (const [key, desc] of Object.entries(spec)) {
    const raw = source[key];
    const value = parseOne(key, desc, raw);
    out[key] = value;
  }
  return out as LoadedEnv<S>;
};

const parseOne = (
  key: string,
  desc: EnvVarDescriptor,
  raw: string | undefined,
): string | number | boolean => {
  const present = !isEmpty(raw);
  switch (desc.kind) {
    case 'string':
      return present ? (raw as string).trim() : (desc.default as string);
    case 'number': {
      if (!present) return desc.default as number;
      const n = Number((raw as string).trim());
      if (!Number.isFinite(n)) {
        throw new Error(`Invalid number for env var ${key}: ${raw}`);
      }
      return n;
    }
    case 'boolean': {
      if (!present) return desc.default as boolean;
      const trimmed = (raw as string).trim().toLowerCase();
      if (trimmed === 'true' || trimmed === '1') return true;
      if (trimmed === 'false' || trimmed === '0') return false;
      throw new Error(`Invalid boolean for env var ${key}: ${raw}`);
    }
    /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
    default:
      return assertNever(desc);
  }
};
