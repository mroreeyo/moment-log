import { assertNever } from '../shared/assert-never.js';

export const DOMAIN_ERROR_CODES = Object.freeze([
  'SLOT_CLOSED',
  'PROMPT_MISMATCH',
  'CLOCK_SKEW',
  'RAW_EXPIRED',
  'RETRY_COOLDOWN',
  'RETRY_EXHAUSTED',
  'INVITE_INVALID',
  'INVITE_RATE_LIMITED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
] as const);

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainError =
  | { readonly code: 'SLOT_CLOSED'; readonly promptId: string }
  | { readonly code: 'PROMPT_MISMATCH'; readonly expected: string; readonly actual: string }
  | { readonly code: 'CLOCK_SKEW'; readonly serverTime: string }
  | { readonly code: 'RAW_EXPIRED'; readonly promptId: string }
  | { readonly code: 'RETRY_COOLDOWN'; readonly retryAfterSec: number }
  | { readonly code: 'RETRY_EXHAUSTED' }
  | { readonly code: 'INVITE_INVALID' }
  | { readonly code: 'INVITE_RATE_LIMITED'; readonly retryAfterSec: number }
  | { readonly code: 'UNAUTHORIZED' }
  | { readonly code: 'FORBIDDEN' }
  | { readonly code: 'NOT_FOUND'; readonly resource: string }
  | {
      readonly code: 'VALIDATION_FAILED';
      readonly details: { readonly [field: string]: unknown };
    };

export interface ErrorResponseBody {
  readonly error: DomainErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface ErrorResponse {
  readonly status: number;
  readonly body: ErrorResponseBody;
}

const DOMAIN_ERROR_CODE_SET: ReadonlySet<string> = new Set(DOMAIN_ERROR_CODES);

export const isDomainError = (value: unknown): value is DomainError => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { code?: unknown };
  return typeof candidate.code === 'string' && DOMAIN_ERROR_CODE_SET.has(candidate.code);
};

const MESSAGES: Readonly<Record<DomainErrorCode, string>> = {
  SLOT_CLOSED: '해당 슬롯은 이미 마감되었습니다',
  PROMPT_MISMATCH: '촬영 시작 시각과 슬롯이 일치하지 않습니다',
  CLOCK_SKEW: '기기 시간이 서버와 어긋나 있습니다',
  RAW_EXPIRED: '원본이 삭제되어 재시도할 수 없습니다',
  RETRY_COOLDOWN: '잠시 후 다시 시도해주세요',
  RETRY_EXHAUSTED: '재시도 한도를 초과했습니다',
  INVITE_INVALID: '유효하지 않은 초대 코드입니다',
  INVITE_RATE_LIMITED: '초대 시도 제한에 걸렸습니다',
  UNAUTHORIZED: '로그인이 필요합니다',
  FORBIDDEN: '접근 권한이 없습니다',
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다',
  VALIDATION_FAILED: '요청 형식이 올바르지 않습니다',
};

export const toErrorResponse = (error: DomainError): ErrorResponse => {
  const message = MESSAGES[error.code];
  switch (error.code) {
    case 'SLOT_CLOSED':
      return mk(409, error.code, message, { promptId: error.promptId });
    case 'PROMPT_MISMATCH':
      return mk(409, error.code, message, {
        expected: error.expected,
        actual: error.actual,
      });
    case 'CLOCK_SKEW':
      return mk(422, error.code, message, { serverTime: error.serverTime });
    case 'RAW_EXPIRED':
      return mk(410, error.code, message, { promptId: error.promptId });
    case 'RETRY_COOLDOWN':
      return mk(429, error.code, message, { retryAfterSec: error.retryAfterSec });
    case 'RETRY_EXHAUSTED':
      return mk(429, error.code, message, {});
    case 'INVITE_INVALID':
      return mk(404, error.code, message, {});
    case 'INVITE_RATE_LIMITED':
      return mk(429, error.code, message, { retryAfterSec: error.retryAfterSec });
    case 'UNAUTHORIZED':
      return mk(401, error.code, message, {});
    case 'FORBIDDEN':
      return mk(403, error.code, message, {});
    case 'NOT_FOUND':
      return mk(404, error.code, message, { resource: error.resource });
    case 'VALIDATION_FAILED':
      return mk(400, error.code, message, { ...error.details });
    /* istanbul ignore next -- exhaustiveness guard, unreachable by types */
    default:
      return assertNever(error);
  }
};

const mk = (
  status: number,
  code: DomainErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>>,
): ErrorResponse => ({
  status,
  body: { error: code, message, details },
});
