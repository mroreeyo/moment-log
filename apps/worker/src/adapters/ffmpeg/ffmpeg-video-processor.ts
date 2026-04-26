import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type {
  CompiledVideo,
  NormalizedClip,
  VideoClipInput,
  VideoProcessor,
} from '../../ports/driven/index.js';

export interface FfmpegVideoProcessorOptions {
  readonly workDir: string;
  readonly ffmpegBin?: string;
  readonly ffprobeBin?: string;
}

export class FfmpegVideoProcessor implements VideoProcessor {
  private readonly ffmpegBin: string;
  private readonly ffprobeBin: string;

  constructor(private readonly options: FfmpegVideoProcessorOptions) {
    this.ffmpegBin = options.ffmpegBin ?? 'ffmpeg';
    this.ffprobeBin = options.ffprobeBin ?? 'ffprobe';
  }

  async normalize(input: VideoClipInput): Promise<NormalizedClip> {
    await mkdir(this.options.workDir, { recursive: true });
    const output = `${this.options.workDir}/normalized_${sanitize(input.clipId)}.mp4`;
    await run(this.ffmpegBin, normalizeArgs(input.sourcePath, output));
    return {
      clipId: input.clipId,
      path: output,
      durationSec: await probeDuration(this.ffprobeBin, output),
    };
  }

  async concat(clips: readonly NormalizedClip[]): Promise<CompiledVideo> {
    if (clips.length === 0) throw new Error('cannot concat empty clip list');
    await mkdir(this.options.workDir, { recursive: true });
    const inputList = `${this.options.workDir}/input.txt`;
    const output = `${this.options.workDir}/output.mp4`;
    await writeFile(
      inputList,
      clips.map((clip) => `file '${escapeConcatPath(clip.path)}'`).join('\n'),
    );
    await run(this.ffmpegBin, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      inputList,
      '-c',
      'copy',
      output,
    ]);
    return {
      path: output,
      durationSec: await probeDuration(this.ffprobeBin, output),
      sizeBytes: 0,
    };
  }
}

export const normalizeArgs = (input: string, output: string): readonly string[] => [
  '-y',
  '-i',
  input,
  '-vf',
  'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=30',
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-ar',
  '44100',
  '-ac',
  '2',
  output,
];

const run = async (command: string, args: readonly string[]): Promise<string> =>
  await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: string[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      const tail = stderr.join('').slice(-2000);
      if (code === 0) resolve(tail);
      else reject(new Error(`${command} exited ${code}: ${tail}`));
    });
  });

const probeDuration = async (ffprobeBin: string, path: string): Promise<number> => {
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobeBin, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ]);
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.join('').trim());
      else reject(new Error(`${ffprobeBin} exited ${code}: ${stderr.join('').slice(-1000)}`));
    });
  });
  return Number(out);
};

const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_');
const escapeConcatPath = (value: string): string => value.replace(/'/g, "'\\''");
