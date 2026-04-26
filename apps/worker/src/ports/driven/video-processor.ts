export interface VideoProcessor {
  normalize(input: VideoClipInput): Promise<NormalizedClip>;
  concat(clips: readonly NormalizedClip[]): Promise<CompiledVideo>;
}

export interface VideoClipInput {
  readonly clipId: string;
  readonly sourcePath: string;
}

export interface NormalizedClip {
  readonly clipId: string;
  readonly path: string;
  readonly durationSec: number;
}

export interface CompiledVideo {
  readonly path: string;
  readonly durationSec: number;
  readonly sizeBytes: number;
}
