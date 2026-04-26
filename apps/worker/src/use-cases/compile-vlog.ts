import type { Clock, Storage, VideoProcessor } from '../ports/driven/index.js';

export interface CompileVlogInput {
  readonly promptId: string;
  readonly groupId: string;
  readonly triggerType: 'hourly-tick' | 'retry';
}

export interface ClipForCompile {
  readonly id: string;
  readonly storagePath: string;
  readonly fileSizeBytes: number;
}

export interface VlogCompileRepository {
  readonly claimPendingVlog: (
    input: CompileVlogInput & { readonly now: string },
  ) => Promise<boolean>;
  readonly listClips: (promptId: string) => Promise<readonly ClipForCompile[]>;
  readonly markDone: (input: {
    readonly promptId: string;
    readonly groupId: string;
    readonly storagePath: string;
    readonly clipCount: number;
    readonly durationSec: number;
    readonly completedAt: string;
  }) => Promise<void>;
  readonly markFailed: (input: {
    readonly promptId: string;
    readonly groupId: string;
    readonly stage: string;
    readonly message: string;
  }) => Promise<void>;
}

export interface CompileVlogDeps {
  readonly repo: VlogCompileRepository;
  readonly storage: Storage;
  readonly processor: VideoProcessor;
  readonly clock: Clock;
  readonly workDir: string;
  readonly logger?: (message: string, context?: Readonly<Record<string, unknown>>) => void;
}

export type CompileVlogResult =
  | { readonly status: 'done'; readonly outcome: 'compiled'; readonly vlogStoragePath: string }
  | { readonly status: 'already_processing' }
  | { readonly status: 'failed'; readonly stage: string; readonly message: string };

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export const compileVlog = async (
  deps: CompileVlogDeps,
  input: CompileVlogInput,
): Promise<CompileVlogResult> => {
  let stage = 'claim';
  try {
    const claimed = await deps.repo.claimPendingVlog({
      ...input,
      now: deps.clock.now().toISOString(),
    });
    if (!claimed) return { status: 'already_processing' };

    stage = 'download';
    const clips = await deps.repo.listClips(input.promptId);
    const eligible = clips.filter((clip) => clip.fileSizeBytes <= MAX_INPUT_BYTES);
    for (const skipped of clips.filter((clip) => clip.fileSizeBytes > MAX_INPUT_BYTES)) {
      deps.logger?.('clip skipped: file too large', {
        clipId: skipped.id,
        bytes: skipped.fileSizeBytes,
      });
    }
    if (eligible.length === 0) throw new Error('no eligible clips to compile');

    const downloaded = await Promise.all(
      eligible.map(async (clip, index) => {
        const localPath = `${deps.workDir}/clip_${index}.mp4`;
        await deps.storage.download(clip.storagePath, localPath);
        return { clipId: clip.id, sourcePath: localPath };
      }),
    );

    stage = 'normalize';
    const normalized = [];
    for (const clip of downloaded) normalized.push(await deps.processor.normalize(clip));

    stage = 'concat';
    const compiled = await deps.processor.concat(normalized);

    stage = 'upload';
    const vlogStoragePath = `vlogs/${input.groupId}/${input.promptId}/output.mp4`;
    await deps.storage.upload(compiled.path, vlogStoragePath);

    stage = 'persist';
    await deps.repo.markDone({
      promptId: input.promptId,
      groupId: input.groupId,
      storagePath: vlogStoragePath,
      clipCount: normalized.length,
      durationSec: compiled.durationSec,
      completedAt: deps.clock.now().toISOString(),
    });
    return { status: 'done', outcome: 'compiled', vlogStoragePath };
  } catch (error) {
    const message = errorSummary(error);
    await deps.repo.markFailed({
      promptId: input.promptId,
      groupId: input.groupId,
      stage,
      message,
    });
    return { status: 'failed', stage, message };
  }
};

const errorSummary = (error: unknown): string =>
  error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
