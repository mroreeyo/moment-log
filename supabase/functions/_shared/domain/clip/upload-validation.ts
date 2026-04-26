import type { DomainError } from '../api/errors.ts';

export const MAX_CLIP_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_CLIP_MIME_TYPES = Object.freeze(['video/mp4', 'video/quicktime'] as const);

export type AllowedClipMimeType = (typeof ALLOWED_CLIP_MIME_TYPES)[number];

export interface UploadRequestInput {
  readonly promptId: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
}

export interface UploadRequestValid {
  readonly promptId: string;
  readonly mimeType: AllowedClipMimeType;
  readonly fileSizeBytes: number;
}

export type UploadRequestValidation =
  | { readonly ok: true; readonly value: UploadRequestValid }
  | { readonly ok: false; readonly error: DomainError };

const MIME_SET: ReadonlySet<string> = new Set(ALLOWED_CLIP_MIME_TYPES);

export const validateUploadRequest = (input: UploadRequestInput): UploadRequestValidation => {
  const fields: string[] = [];
  if (typeof input.promptId !== 'string' || input.promptId.trim().length === 0) {
    fields.push('promptId');
  }
  if (!MIME_SET.has(input.mimeType)) {
    fields.push('mimeType');
  }
  if (
    typeof input.fileSizeBytes !== 'number' ||
    !Number.isInteger(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > MAX_CLIP_SIZE_BYTES
  ) {
    fields.push('fileSizeBytes');
  }
  if (fields.length > 0) {
    return {
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields } },
    };
  }
  return {
    ok: true,
    value: {
      promptId: input.promptId.trim(),
      mimeType: input.mimeType as AllowedClipMimeType,
      fileSizeBytes: input.fileSizeBytes,
    },
  };
};
