import {
  createUseUploadClip,
  signedUploadHeaders,
  signedUploadSignature,
  uploadProgressSnapshot,
  type JsonApiClient,
  type LocalClipFileStore,
  type SignedUploadTransport,
  type UploadBody,
  type UploadProgressSnapshot,
} from './use-upload-clip.js';

const input = {
  promptId: 'prompt-1',
  localUri: 'file:///cache/pending/clip.mp4',
  recordingStartedAt: '2026-04-27T00:00:00.000Z',
  fileSizeBytes: 3_000_000,
} as const;

interface Harness {
  readonly api: JsonApiClient;
  readonly files: LocalClipFileStore;
  readonly uploader: SignedUploadTransport;
  readonly progress: UploadProgressSnapshot[];
  readonly signedRequests: unknown[];
  readonly finalizeRequests: unknown[];
  readonly uploadedHeaders: Readonly<Record<string, string>>[];
  readonly removed: string[];
}

describe('createUseUploadClip', () => {
  it('signs, uploads, finalizes, reports progress, and removes pending file on success', async () => {
    const harness = makeHarness();
    const result = await createUseUploadClip({
      api: harness.api,
      files: harness.files,
      uploader: harness.uploader,
      onProgress: (snapshot) => harness.progress.push(snapshot),
    }).upload(input);

    expect(result).toEqual({
      ok: true,
      clipId: 'clip-1',
      promptId: 'prompt-1',
      storagePath: 'raw/group/prompt/user.mp4',
      replaced: false,
    });
    expect(harness.signedRequests).toEqual([
      { promptId: 'prompt-1', mimeType: 'video/mp4', fileSizeBytes: 3_000_000 },
    ]);
    expect(harness.finalizeRequests).toEqual([
      {
        promptId: 'prompt-1',
        recordingStartedAt: '2026-04-27T00:00:00.000Z',
        fileSizeBytes: 3_000_000,
      },
    ]);
    expect(harness.uploadedHeaders).toEqual([
      { 'content-type': 'video/mp4', 'x-signature': 'signed-token' },
    ]);
    expect(harness.removed).toEqual(['file:///cache/pending/clip.mp4']);
    expect(harness.progress.map((snapshot) => snapshot.phase)).toEqual([
      'signing',
      'uploading',
      'finalizing',
      'done',
    ]);
  });

  it('keeps pending file and returns retryable failure when binary upload fails', async () => {
    const harness = makeHarness({ uploadFails: true });
    const result = await createUseUploadClip({
      api: harness.api,
      files: harness.files,
      uploader: harness.uploader,
      onProgress: (snapshot) => harness.progress.push(snapshot),
    }).upload(input);

    expect(result).toMatchObject({
      ok: false,
      kind: 'network',
      phase: 'uploading',
      retryable: true,
      localUri: 'file:///cache/pending/clip.mp4',
    });
    expect(harness.removed).toEqual([]);
    expect(harness.progress.at(-1)).toEqual({
      phase: 'failed',
      message: '영상 업로드에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.',
      canRetry: true,
    });
  });

  it('removes pending file and surfaces terminal slot error when finalize returns 409', async () => {
    const harness = makeHarness({ finalizeError: 'SLOT_CLOSED' });
    const result = await createUseUploadClip({
      api: harness.api,
      files: harness.files,
      uploader: harness.uploader,
      onProgress: (snapshot) => harness.progress.push(snapshot),
    }).upload(input);

    expect(result).toEqual({
      ok: false,
      kind: 'terminal',
      phase: 'finalizing',
      message: '슬롯 마감됨',
      retryable: false,
      localUri: 'file:///cache/pending/clip.mp4',
      serverError: 'SLOT_CLOSED',
    });
    expect(harness.removed).toEqual(['file:///cache/pending/clip.mp4']);
  });
});

describe('signed upload helpers', () => {
  it('extracts signature token for the required x-signature header', () => {
    expect(signedUploadSignature('https://storage.example/upload?token=abc')).toBe('abc');
    expect(signedUploadSignature('https://storage.example/upload?signature=def')).toBe('def');
    expect(signedUploadSignature('not a url')).toBeNull();
    expect(signedUploadHeaders('https://storage.example/upload?token=abc', 'video/mp4')).toEqual({
      'content-type': 'video/mp4',
      'x-signature': 'abc',
    });
  });

  it('builds retry affordance only for failed progress state', () => {
    expect(uploadProgressSnapshot('uploading')).toEqual({
      phase: 'uploading',
      message: '영상 업로드 중',
      canRetry: false,
    });
    expect(uploadProgressSnapshot('failed')).toEqual({
      phase: 'failed',
      message: '업로드 실패',
      canRetry: true,
    });
  });
});

const makeHarness = (
  options: {
    readonly uploadFails?: boolean;
    readonly finalizeError?: string;
  } = {},
): Harness => {
  const signedRequests: unknown[] = [];
  const finalizeRequests: unknown[] = [];
  const uploadedHeaders: Readonly<Record<string, string>>[] = [];
  const removed: string[] = [];
  const fileBody = new Uint8Array([1, 2, 3]);
  const api: JsonApiClient = {
    postJson: <RequestBody, ResponseBody>(
      path: string,
      body: RequestBody,
    ): Promise<ResponseBody> => {
      if (path === '/clips/upload-url') {
        signedRequests.push(body);
        return Promise.resolve({
          uploadUrl: 'https://storage.example/upload?token=signed-token',
          expiresAt: '2026-04-27T00:30:00.000Z',
          storagePath: 'raw/group/prompt/user.mp4',
        } as ResponseBody);
      }
      if (path === '/clips') {
        finalizeRequests.push(body);
        if (options.finalizeError !== undefined) {
          throw new TestServerError(options.finalizeError);
        }
        return Promise.resolve({
          clipId: 'clip-1',
          promptId: 'prompt-1',
          storagePath: 'raw/group/prompt/user.mp4',
          replaced: false,
        } as ResponseBody);
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
  };
  return {
    api,
    files: {
      read: (): Promise<UploadBody> => Promise.resolve(fileBody),
      remove: (localUri): Promise<void> => {
        removed.push(localUri);
        return Promise.resolve();
      },
    },
    uploader: {
      put: (_uploadUrl, _body, uploadOptions): Promise<void> => {
        uploadedHeaders.push(uploadOptions.headers);
        if (options.uploadFails === true) {
          return Promise.reject(new Error('offline'));
        }
        return Promise.resolve();
      },
    },
    progress: [],
    signedRequests,
    finalizeRequests,
    uploadedHeaders,
    removed,
  };
};

class TestServerError extends Error {
  constructor(readonly error: string) {
    super(error);
  }
}
