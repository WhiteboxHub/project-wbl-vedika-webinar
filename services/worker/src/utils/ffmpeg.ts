import { RECORDING_CONSTANTS } from '@webinar/shared';

export interface FFmpegOptions {
  inputPath: string;
  outputPath: string;
  resolution: '1080p' | '720p';
  ffmpegPath?: string;
}

export interface FFmpegCommand {
  command: string;
  args: string[];
}

export function buildFFmpegCommand(options: FFmpegOptions): FFmpegCommand {
  const { inputPath, outputPath, resolution, ffmpegPath = '/usr/bin/ffmpeg' } = options;

  if (!inputPath || !outputPath) {
    throw new Error('Input and output paths are required');
  }

  if (!inputPath.startsWith('/')) {
    throw new Error('Input path must be absolute');
  }

  if (!outputPath.startsWith('/')) {
    throw new Error('Output path must be absolute');
  }

  const resolutionConfig =
    resolution === '1080p'
      ? RECORDING_CONSTANTS.RESOLUTION_1080P
      : RECORDING_CONSTANTS.RESOLUTION_720P;

  const scaleFilter = `scale=${resolutionConfig.width}:${resolutionConfig.height}:force_original_aspect_ratio=decrease,pad=${resolutionConfig.width}:${resolutionConfig.height}:(ow-iw)/2:(oh-ih)/2`;

  const args = [
    '-i',
    inputPath,
    '-c:v',
    RECORDING_CONSTANTS.VIDEO_CODEC,
    '-c:a',
    RECORDING_CONSTANTS.AUDIO_CODEC,
    '-pix_fmt',
    RECORDING_CONSTANTS.PIXEL_FORMAT,
    '-r',
    String(RECORDING_CONSTANTS.FRAME_RATE),
    '-vf',
    scaleFilter,
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ];

  return {
    command: ffmpegPath,
    args,
  };
}

export function getFullCommand(options: FFmpegOptions): string {
  const { command, args } = buildFFmpegCommand(options);
  return `${command} ${args.join(' ')}`;
}
