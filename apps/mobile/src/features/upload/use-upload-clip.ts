import type {
  PostClipsRequest,
  PostClipsResponse,
  PostClipsUploadUrlRequest,
  PostClipsUploadUrlResponse,
} from '@momentlog/domain/api';

export type UploadPhase = 'idle' | 'signing' | 'uploading' | 'finalizing' | 'done' | 'failed';

export type UploadFailureKind = 'network' | 'terminal' | 'unexpected';

export interface UploadProgressSnapshot {
  readonly phase: UploadPhase;
  readonly message: string;
  readonly canRetry: boolean;
}

export interface UploadClipInput {
  readonly promptId: string;
  readonly localUri: string;
  readonly recordingStartedAt: string;
  readonly fileSizeBytes: number;
  readonly mimeType?: 'video/mp4';
}

export interface UploadClipSuccess {
  readonly ok: true;
  readonly clipId: string;
  readonly promptId: string;
  readonly storagePath: string;
  readonly replaced: boolean;
}

export interface UploadClipFailure {
  readonly ok: false;
  readonly kind: UploadFailureKind;
  readonly phase: Exclude<UploadPhase, 'idle' | 'done'>;
  readonly message: string;
  readonly retryable: boolean;
  readonly localUri: string;
  readonly serverError?: string;
}

export type UploadClipResult = UploadClipSuccess | UploadClipFailure;

export type UploadProgressListener = (snapshot: UploadProgressSnapshot) => void;

export interface JsonApiClient {
  readonly postJson: <RequestBody, ResponseBody>(
    path: string,
    body: RequestBody,
  ) => Promise<ResponseBody>;
}

export type UploadBody = Uint8Array | ArrayBuffer | string;

export interface LocalClipFileStore {
  readonly read: (localUri: string) => Promise<UploadBody>;
  readonly remove: (localUri: string) => Promise<void>;
}

export interface SignedUploadTransport {
  readonly put: (
    uploadUrl: string,
    body: UploadBody,
    options: {
      readonly contentType: 'video/mp4';
      readonly headers: Readonly<Record<string, string>>;
    },
  ) => Promise<void>;
}

export interface UseUploadClipDeps {
  readonly api: JsonApiClient;
  readonly files: LocalClipFileStore;
  readonly uploader: SignedUploadTransport;
  readonly onProgress?: UploadProgressListener;
}

export interface UseUploadClip {
  readonly upload: (input: UploadClipInput) => Promise<UploadClipResult>;
  readonly retry: (input: UploadClipInput) => Promise<UploadClipResult>;
}

const DEFAULT_MIME_TYPE = 'video/mp4' as const;

const RETRYABLE_MESSAGES: Readonly<Record<Exclude<UploadPhase, 'idle' | 'done'>, string>> = {
  signing: '업로드 URL을 발급하지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.',
  uploading: '영상 업로드에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.',
  finalizing: '업로드 완료 처리에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.',
  failed: '업로드에 실패했습니다. 다시 시도해주세요.',
};

const TERMINAL_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  SLOT_CLOSED: '슬롯 마감됨',
  PROMPT_MISMATCH: '촬영 시각과 슬롯이 일치하지 않습니다.',
  CLOCK_SKEW: '기기 시간이 서버와 어긋나 있습니다.',
  FORBIDDEN: '이 그룹에 업로드할 권한이 없습니다.',
  NOT_FOUND: '업로드할 슬롯을 찾을 수 없습니다.',
  VALIDATION_FAILED: '업로드 요청 형식이 올바르지 않습니다.',
};

export const createUseUploadClip = (deps: UseUploadClipDeps): UseUploadClip => {
  const upload = async (input: UploadClipInput): Promise<UploadClipResult> =>
    runUpload(deps, normalizeInput(input));

  return { upload, retry: upload };
};

export const uploadProgressSnapshot = (
  phase: UploadPhase,
  message = defaultMessageForPhase(phase),
): UploadProgressSnapshot => ({
  phase,
  message,
  canRetry: phase === 'failed',
});

const runUpload = async (
  deps: UseUploadClipDeps,
  input: Required<UploadClipInput>,
): Promise<UploadClipResult> => {
  const notify = (phase: UploadPhase, message?: string): void => {
    deps.onProgress?.(uploadProgressSnapshot(phase, message));
  };

  let phase: Exclude<UploadPhase, 'idle' | 'done'> = 'signing';
  try {
    notify('signing');
    const signed = await deps.api.postJson<PostClipsUploadUrlRequest, PostClipsUploadUrlResponse>(
      '/clips/upload-url',
      {
        promptId: input.promptId,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
      },
    );

    phase = 'uploading';
    notify('uploading');
    const body = await deps.files.read(input.localUri);
    await deps.uploader.put(signed.uploadUrl, body, {
      contentType: input.mimeType,
      headers: signedUploadHeaders(signed.uploadUrl, input.mimeType),
    });

    phase = 'finalizing';
    notify('finalizing');
    const finalized = await deps.api.postJson<PostClipsRequest, PostClipsResponse>('/clips', {
      promptId: input.promptId,
      recordingStartedAt: input.recordingStartedAt,
      fileSizeBytes: input.fileSizeBytes,
    });

    await deps.files.remove(input.localUri);
    notify('done');
    return {
      ok: true,
      clipId: finalized.clipId,
      promptId: finalized.promptId,
      storagePath: finalized.storagePath,
      replaced: finalized.replaced,
    };
  } catch (error) {
    const serverError = readServerError(error);
    const terminal = serverError !== undefined && isTerminalServerError(serverError);
    if (terminal || phase === 'finalizing') {
      await safeRemove(deps.files, input.localUri);
    }
    notify('failed', terminal ? terminalMessage(serverError) : RETRYABLE_MESSAGES[phase]);
    return {
      ok: false,
      kind: terminal ? 'terminal' : error instanceof Error ? 'network' : 'unexpected',
      phase,
      message: terminal ? terminalMessage(serverError) : RETRYABLE_MESSAGES[phase],
      retryable: !terminal,
      localUri: input.localUri,
      ...(serverError === undefined ? {} : { serverError }),
    };
  }
};

export const signedUploadHeaders = (
  uploadUrl: string,
  contentType: 'video/mp4',
): Readonly<Record<string, string>> => {
  const signature = signedUploadSignature(uploadUrl);
  return {
    'content-type': contentType,
    ...(signature === null ? {} : { 'x-signature': signature }),
  };
};

export const signedUploadSignature = (uploadUrl: string): string | null =>
  queryParam(uploadUrl, 'token') ?? queryParam(uploadUrl, 'signature');

const queryParam = (url: string, name: string): string | null => {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;
  const hashStart = url.indexOf('#', queryStart);
  const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  for (const segment of query.split('&')) {
    const [rawKey, rawValue = ''] = segment.split('=', 2);
    if (decodeQueryPart(rawKey) === name) return decodeQueryPart(rawValue);
  }
  return null;
};

const decodeQueryPart = (value: string | undefined): string =>
  decodeURIComponent((value ?? '').replace(/\+/g, ' '));

const normalizeInput = (input: UploadClipInput): Required<UploadClipInput> => ({
  ...input,
  mimeType: input.mimeType ?? DEFAULT_MIME_TYPE,
});

const readServerError = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as { readonly error?: unknown; readonly code?: unknown }).error;
  const code = (error as { readonly error?: unknown; readonly code?: unknown }).code;
  if (typeof value === 'string') return value;
  if (typeof code === 'string') return code;
  return undefined;
};

const isTerminalServerError = (error: string): boolean => error in TERMINAL_ERROR_MESSAGES;

const terminalMessage = (error: string | undefined): string =>
  error === undefined ? '업로드를 완료할 수 없습니다.' : (TERMINAL_ERROR_MESSAGES[error] ?? error);

const safeRemove = async (files: LocalClipFileStore, localUri: string): Promise<void> => {
  try {
    await files.remove(localUri);
  } catch {
    // Keep the original upload error authoritative; cleanup failure is non-retryable UI noise.
  }
};

function defaultMessageForPhase(phase: UploadPhase): string {
  switch (phase) {
    case 'idle':
      return '업로드 대기 중';
    case 'signing':
      return '업로드 URL 발급 중';
    case 'uploading':
      return '영상 업로드 중';
    case 'finalizing':
      return '업로드 완료 처리 중';
    case 'done':
      return '업로드 완료';
    case 'failed':
      return '업로드 실패';
  }
}
