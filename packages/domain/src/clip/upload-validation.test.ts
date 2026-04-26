import { describe, it, expect } from '@jest/globals';
import {
  MAX_CLIP_SIZE_BYTES,
  ALLOWED_CLIP_MIME_TYPES,
  validateUploadRequest,
} from './upload-validation.js';

describe('MAX_CLIP_SIZE_BYTES', () => {
  it('is exactly 10 MiB per PRD §20.1', () => {
    expect(MAX_CLIP_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('ALLOWED_CLIP_MIME_TYPES', () => {
  it('contains only video/mp4 and video/quicktime', () => {
    expect(new Set(ALLOWED_CLIP_MIME_TYPES)).toEqual(new Set(['video/mp4', 'video/quicktime']));
  });
});

describe('validateUploadRequest', () => {
  const valid = {
    promptId: '00000000-0000-0000-0000-000000000001',
    mimeType: 'video/mp4' as const,
    fileSizeBytes: 2_000_000,
  };

  it('accepts a valid request', () => {
    const r = validateUploadRequest(valid);
    expect(r).toEqual({ ok: true, value: valid });
  });

  it('accepts file at exact 10MiB boundary', () => {
    const r = validateUploadRequest({ ...valid, fileSizeBytes: MAX_CLIP_SIZE_BYTES });
    expect(r.ok).toBe(true);
  });

  it('rejects empty promptId', () => {
    const r = validateUploadRequest({ ...valid, promptId: '' });
    expect(r).toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields: ['promptId'] } },
    });
  });

  it('rejects whitespace-only promptId', () => {
    const r = validateUploadRequest({ ...valid, promptId: '   ' });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid mime type', () => {
    const r = validateUploadRequest({
      ...valid,
      mimeType: 'image/png' as unknown as typeof valid.mimeType,
    });
    expect(r).toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields: ['mimeType'] } },
    });
  });

  it('rejects zero file size', () => {
    const r = validateUploadRequest({ ...valid, fileSizeBytes: 0 });
    expect(r).toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', details: { fields: ['fileSizeBytes'] } },
    });
  });

  it('rejects negative file size', () => {
    const r = validateUploadRequest({ ...valid, fileSizeBytes: -1 });
    expect(r.ok).toBe(false);
  });

  it('rejects non-integer file size', () => {
    const r = validateUploadRequest({ ...valid, fileSizeBytes: 1.5 });
    expect(r.ok).toBe(false);
  });

  it('rejects file exceeding 10MiB + 1 byte', () => {
    const r = validateUploadRequest({
      ...valid,
      fileSizeBytes: MAX_CLIP_SIZE_BYTES + 1,
    });
    expect(r.ok).toBe(false);
  });

  it('accumulates multiple field failures in the same response', () => {
    const r = validateUploadRequest({
      promptId: '',
      mimeType: 'application/json' as unknown as typeof valid.mimeType,
      fileSizeBytes: -5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === 'VALIDATION_FAILED') {
      const fields = (r.error.details['fields'] as readonly string[] | undefined) ?? [];
      expect(new Set(fields)).toEqual(new Set(['promptId', 'mimeType', 'fileSizeBytes']));
    } else {
      throw new Error('expected VALIDATION_FAILED');
    }
  });
});
