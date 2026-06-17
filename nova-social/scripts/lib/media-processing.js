/**
 * FFmpeg media processing -- video+music mixing and image-to-video.
 * Replaces duplicated download, FFmpeg, and cleanup patterns.
 *
 * Includes HTTP status validation on downloads and improved FFmpeg
 * error messages from the error-handling improvements.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { downloadToFile, cleanupFiles, createTempDir } from './fetch-utils.js';

/**
 * Run an FFmpeg pipeline in a temp directory with automatic cleanup.
 * Downloads the media files, runs the processor, and returns the output buffer.
 *
 * @param {string} prefix - Temp dir prefix
 * @param {Array<{url: string, filename: string}>} downloads - Files to download
 * @param {function} processor - (resolvedPaths, outputPath) => void -- runs FFmpeg
 * @param {string} outputFilename - Name of the output file to read
 */
export async function withMediaPipeline(prefix, downloads, processor, outputFilename) {
  const { resolve } = createTempDir(prefix);
  const paths = downloads.map(d => resolve(d.filename));
  const outputPath = resolve(outputFilename);

  try {
    await Promise.all(
      downloads.map((d, i) => downloadToFile(d.url, paths[i]))
    );
    processor(paths, outputPath);
    return readFileSync(outputPath);
  } finally {
    cleanupFiles(...paths, outputPath);
  }
}

/**
 * Get video duration via ffprobe.
 */
export function getVideoDuration(videoPath) {
  const str = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    { encoding: 'utf8' }
  ).trim();
  return parseFloat(str) || 15;
}

/**
 * Mix a video file with a music file using FFmpeg.
 * Tries mixing with original audio first; falls back to music-only on failure.
 */
export async function mixVideoWithMusic(videoUrl, musicUrl) {
  return withMediaPipeline(
    'reel-',
    [
      { url: videoUrl, filename: 'video.mp4' },
      { url: musicUrl, filename: 'music.mp3' },
    ],
    ([videoPath, audioPath], outputPath) => {
      const duration = getVideoDuration(videoPath);
      try {
        execSync(
          `ffmpeg -y -i "${videoPath}" -i "${audioPath}" `
          + `-filter_complex "[1:a]volume=0.20,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[music];`
          + `[0:a]volume=1.0[orig];`
          + `[orig][music]amix=inputs=2:duration=shortest[aout]" `
          + `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${outputPath}"`,
          { timeout: 120_000, stdio: 'pipe' }
        );
      } catch (ffmpegErr) {
        console.warn(`  \u26A0 FFmpeg mix with original audio failed: ${ffmpegErr.message} \u2014 retrying without original audio`);
        execSync(
          `ffmpeg -y -i "${videoPath}" -i "${audioPath}" `
          + `-filter_complex "[1:a]volume=0.25,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[aout]" `
          + `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${outputPath}"`,
          { timeout: 120_000, stdio: 'pipe' }
        );
      }
    },
    'output.mp4'
  );
}

/**
 * Create a Ken Burns zoom video from a still image with background music.
 */
export async function createVideoFromImage(imageUrl, musicUrl, durationSec = 10) {
  return withMediaPipeline(
    'img2vid-',
    [
      { url: imageUrl, filename: 'image.jpg' },
      { url: musicUrl, filename: 'music.mp3' },
    ],
    ([imgPath, audioPath], outputPath) => {
      const fps = 30;
      const totalFrames = durationSec * fps;
      try {
        execSync(
          `ffmpeg -y -loop 1 -i "${imgPath}" -i "${audioPath}" `
          + `-filter_complex "`
          + `[0:v]scale=1920:1920:force_original_aspect_ratio=increase,`
          + `crop=1080:1920,`
          + `zoompan=z='min(zoom+0.0005,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1080x1920:fps=${fps},`
          + `fade=t=in:st=0:d=0.5,fade=t=out:st=${durationSec - 0.5}:d=0.5[v];`
          + `[1:a]volume=0.30,afade=t=in:st=0:d=1,afade=t=out:st=${durationSec - 2}:d=2[a]`
          + `" `
          + `-map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k `
          + `-t ${durationSec} -pix_fmt yuv420p -shortest "${outputPath}"`,
          { timeout: 180_000, stdio: 'pipe' }
        );
      } catch (ffmpegErr) {
        throw new Error(`FFmpeg Ken Burns video creation failed: ${ffmpegErr.message}`);
      }
    },
    'output.mp4'
  );
}
