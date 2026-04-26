import { normalizeArgs } from '../src/adapters/ffmpeg/ffmpeg-video-processor.js';

describe('normalizeArgs', () => {
  it('locks output to 720x1280 h264/aac 30fps', () => {
    expect(normalizeArgs('in.mov', 'out.mp4')).toEqual([
      '-y',
      '-i',
      'in.mov',
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
      'out.mp4',
    ]);
  });
});
