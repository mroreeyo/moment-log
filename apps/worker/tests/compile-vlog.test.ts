import {
  compileVlog,
  type ClipForCompile,
  type VlogCompileRepository,
} from '../src/use-cases/compile-vlog.js';
import type {
  CompiledVideo,
  NormalizedClip,
  Storage,
  VideoClipInput,
  VideoProcessor,
} from '../src/ports/driven/index.js';

describe('compileVlog', () => {
  it('claims, downloads, normalizes, concats, uploads, and persists compiled output', async () => {
    const repo = new FakeRepo({ clips: [clip('c1'), clip('c2')] });
    const storage = new FakeStorage();
    const processor = new FakeProcessor();

    const result = await compileVlog(
      { repo, storage, processor, clock: fixedClock, workDir: '/tmp/work' },
      { promptId: 'p1', groupId: 'g1', triggerType: 'hourly-tick' },
    );

    expect(result).toEqual({
      status: 'done',
      outcome: 'compiled',
      vlogStoragePath: 'vlogs/g1/p1/output.mp4',
    });
    expect(storage.downloads).toEqual([
      ['raw/g1/p1/c1.mp4', '/tmp/work/clip_0.mp4'],
      ['raw/g1/p1/c2.mp4', '/tmp/work/clip_1.mp4'],
    ]);
    expect(processor.normalized.map((input) => input.clipId)).toEqual(['c1', 'c2']);
    expect(storage.uploads).toEqual([['/tmp/work/output.mp4', 'vlogs/g1/p1/output.mp4']]);
    expect(repo.done).toMatchObject({ promptId: 'p1', clipCount: 2, durationSec: 6 });
  });

  it('returns already_processing when CAS claim fails', async () => {
    const repo = new FakeRepo({ claimed: false });
    const result = await compileVlog(
      {
        repo,
        storage: new FakeStorage(),
        processor: new FakeProcessor(),
        clock: fixedClock,
        workDir: '/tmp/work',
      },
      { promptId: 'p1', groupId: 'g1', triggerType: 'hourly-tick' },
    );

    expect(result).toEqual({ status: 'already_processing' });
    expect(repo.failed).toBeNull();
  });

  it('persists failed stage and message when normalize fails', async () => {
    const repo = new FakeRepo({ clips: [clip('c1')] });
    const result = await compileVlog(
      {
        repo,
        storage: new FakeStorage(),
        processor: new FakeProcessor({ failNormalize: true }),
        clock: fixedClock,
        workDir: '/tmp/work',
      },
      { promptId: 'p1', groupId: 'g1', triggerType: 'hourly-tick' },
    );

    expect(result).toMatchObject({ status: 'failed', stage: 'normalize' });
    expect(repo.failed).toMatchObject({ promptId: 'p1', stage: 'normalize' });
  });
});

const fixedClock = { now: () => new Date('2026-04-27T00:00:00.000Z') };

const clip = (id: string): ClipForCompile => ({
  id,
  storagePath: `raw/g1/p1/${id}.mp4`,
  fileSizeBytes: 1_000_000,
});

class FakeRepo implements VlogCompileRepository {
  done: unknown = null;
  failed: unknown = null;
  constructor(
    private readonly options: {
      readonly claimed?: boolean;
      readonly clips?: readonly ClipForCompile[];
    },
  ) {}

  claimPendingVlog(): Promise<boolean> {
    return Promise.resolve(this.options.claimed ?? true);
  }

  listClips(): Promise<readonly ClipForCompile[]> {
    return Promise.resolve(this.options.clips ?? []);
  }

  markDone(input: unknown): Promise<void> {
    this.done = input;
    return Promise.resolve();
  }

  markFailed(input: unknown): Promise<void> {
    this.failed = input;
    return Promise.resolve();
  }
}

class FakeStorage implements Storage {
  downloads: Array<[string, string]> = [];
  uploads: Array<[string, string]> = [];

  download(path: string, localDest: string): Promise<void> {
    this.downloads.push([path, localDest]);
    return Promise.resolve();
  }

  upload(localSource: string, path: string): Promise<void> {
    this.uploads.push([localSource, path]);
    return Promise.resolve();
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeProcessor implements VideoProcessor {
  normalized: VideoClipInput[] = [];
  constructor(private readonly options: { readonly failNormalize?: boolean } = {}) {}

  normalize(input: VideoClipInput): Promise<NormalizedClip> {
    this.normalized.push(input);
    if (this.options.failNormalize === true) return Promise.reject(new Error('ffmpeg failed'));
    return Promise.resolve({
      clipId: input.clipId,
      path: `/tmp/work/${input.clipId}.mp4`,
      durationSec: 3,
    });
  }

  concat(): Promise<CompiledVideo> {
    return Promise.resolve({ path: '/tmp/work/output.mp4', durationSec: 6, sizeBytes: 1234 });
  }
}
