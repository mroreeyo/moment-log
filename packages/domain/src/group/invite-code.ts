export const INVITE_CODE_LENGTH = 8;
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const BASE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_ALPHABET = BASE_ALPHABET;

const ALPHABET_SET: ReadonlySet<string> = new Set(INVITE_CODE_ALPHABET);

export type RandomBytesFn = (length: number) => Uint8Array;

export const generateInviteCode = (randomBytes: RandomBytesFn): string => {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  if (!(bytes instanceof Uint8Array) || bytes.length < INVITE_CODE_LENGTH) {
    throw new Error(
      `randomBytes must return at least ${INVITE_CODE_LENGTH} bytes; got ${bytes.length}`,
    );
  }
  const base = INVITE_CODE_ALPHABET.length;
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const idx = (bytes[i] as number) % base;
    code += INVITE_CODE_ALPHABET[idx];
  }
  return code;
};

export const isValidInviteCode = (code: string): boolean => {
  if (typeof code !== 'string') return false;
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const c of code) {
    if (!ALPHABET_SET.has(c)) return false;
  }
  return true;
};
