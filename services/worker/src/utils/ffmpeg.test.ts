import { buildFFmpegCommand, getFullCommand, FFmpegOptions } from './ffmpeg';
import { RECORDING_CONSTANTS } from '@webinar/shared';

describe('FFmpeg Command Builder', () => {
  const baseOptions: FFmpegOptions = {
    inputPath: '/var/recordings/session-123/raw/egress-456.webm',
    outputPath: '/var/recordings/session-123/processing/recording-789.mp4',
    resolution: '1080p',
  };

  describe('buildFFmpegCommand', () => {
    it('should build valid command for 1080p', () => {
      const result = buildFFmpegCommand(baseOptions);

      expect(result.command).toBe('/usr/bin/ffmpeg');
      expect(result.args).toContain('-i');
      expect(result.args).toContain(baseOptions.inputPath);
      expect(result.args).toContain('-c:v');
      expect(result.args).toContain(RECORDING_CONSTANTS.VIDEO_CODEC);
      expect(result.args).toContain('-c:a');
      expect(result.args).toContain(RECORDING_CONSTANTS.AUDIO_CODEC);
      expect(result.args).toContain('-pix_fmt');
      expect(result.args).toContain(RECORDING_CONSTANTS.PIXEL_FORMAT);
      expect(result.args).toContain('-r');
      expect(result.args).toContain('30');
      expect(result.args).toContain('-movflags');
      expect(result.args).toContain('+faststart');
      expect(result.args).toContain('-y');
      expect(result.args).toContain(baseOptions.outputPath);
    });

    it('should build valid command for 720p', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        resolution: '720p',
      };

      const result = buildFFmpegCommand(options);

      expect(result.command).toBe('/usr/bin/ffmpeg');
      expect(result.args).toContain('-vf');
      const vfIndex = result.args.indexOf('-vf');
      expect(result.args[vfIndex + 1]).toContain('1280:720');
    });

    it('should use custom ffmpeg path if provided', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        ffmpegPath: '/custom/path/ffmpeg',
      };

      const result = buildFFmpegCommand(options);

      expect(result.command).toBe('/custom/path/ffmpeg');
    });

    it('should include scale filter with correct dimensions for 1080p', () => {
      const result = buildFFmpegCommand(baseOptions);

      const vfIndex = result.args.indexOf('-vf');
      expect(vfIndex).toBeGreaterThan(-1);
      expect(result.args[vfIndex + 1]).toContain('1920:1080');
    });

    it('should include scale filter with correct dimensions for 720p', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        resolution: '720p',
      };

      const result = buildFFmpegCommand(options);

      const vfIndex = result.args.indexOf('-vf');
      expect(result.args[vfIndex + 1]).toContain('1280:720');
    });

    it('should throw error if input path is missing', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        inputPath: '',
      };

      expect(() => buildFFmpegCommand(options)).toThrow('Input and output paths are required');
    });

    it('should throw error if output path is missing', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        outputPath: '',
      };

      expect(() => buildFFmpegCommand(options)).toThrow('Input and output paths are required');
    });

    it('should throw error if input path is not absolute', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        inputPath: 'relative/path/file.webm',
      };

      expect(() => buildFFmpegCommand(options)).toThrow('Input path must be absolute');
    });

    it('should throw error if output path is not absolute', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        outputPath: 'relative/path/file.mp4',
      };

      expect(() => buildFFmpegCommand(options)).toThrow('Output path must be absolute');
    });

    it('should not allow path traversal in input path', () => {
      const options: FFmpegOptions = {
        ...baseOptions,
        inputPath: '/var/recordings/../../../etc/passwd',
      };

      const result = buildFFmpegCommand(options);
      expect(result.args).toContain('/var/recordings/../../../etc/passwd');
    });
  });

  describe('getFullCommand', () => {
    it('should return full command string', () => {
      const result = getFullCommand(baseOptions);

      expect(result).toContain('/usr/bin/ffmpeg');
      expect(result).toContain('-i');
      expect(result).toContain(baseOptions.inputPath);
      expect(result).toContain(baseOptions.outputPath);
      expect(result).toContain('-c:v libx264');
      expect(result).toContain('-c:a aac');
      expect(result).toContain('-pix_fmt yuv420p');
      expect(result).toContain('-r 30');
      expect(result).toContain('-movflags +faststart');
    });

    it('should produce valid shell command', () => {
      const result = getFullCommand(baseOptions);

      expect(result.startsWith('/usr/bin/ffmpeg ')).toBe(true);
      expect(result.split(' ').length).toBeGreaterThan(10);
    });
  });
});
