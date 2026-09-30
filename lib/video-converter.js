// ─────────────────────────────────────────────
// WRAITH · lib/video-converter.js
// WhatsApp video compatibility pipeline
// ─────────────────────────────────────────────
import { execFile } from 'node:child_process';
import { ffmpegPath, ffprobePath } from './ffmpeg-resolver.js';

/**
 * Helper to run child process with hard timeout and auto-kill
 */
export function runWithTimeout(file, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let child;
    let timer;

    try {
      child = execFile(file, args, (error, stdout, stderr) => {
        if (timer) clearTimeout(timer);
        if (error) {
          return reject(error);
        }
        resolve({ stdout, stderr });
      });

      timer = setTimeout(() => {
        if (child) {
          try { child.kill('SIGKILL'); } catch {}
        }
        reject(new Error(`Process ${file} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    } catch (err) {
      if (timer) clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Probe video and audio streams of local file (single ffprobe call)
 */
export async function probe(file, timeoutMs = 10000) {
  const { stdout } = await runWithTimeout(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,profile,pix_fmt',
    '-of', 'json',
    file,
  ], timeoutMs);
  const streams = JSON.parse(stdout || '{}')?.streams || [];
  return {
    video: streams.find((x) => x.codec_type === 'video') || null,
    audio: streams.find((x) => x.codec_type === 'audio') || null,
  };
}

/**
 * Check if video is natively WhatsApp / Android compatible
 */
export async function isPlayable(file, timeoutMs = 10000) {
  const { video, audio } = await probe(file, timeoutMs);
  if (!video) return false;
  const vOk = video.codec_name === 'h264' && (!video.pix_fmt || video.pix_fmt === 'yuv420p');
  const aOk = !audio || audio.codec_name === 'aac';
  return vOk && aOk;
}

/**
 * Remux container when video streams are already compatible (-c copy)
 */
export async function remux(input, output, timeoutMs = 15000) {
  await runWithTimeout(ffmpegPath, [
    '-y',
    '-threads', '2',
    '-i', input,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-dn', '-sn',
    output,
  ], timeoutMs);
}

/**
 * Detect hardware encoders available in ffmpeg
 */
export async function getHwEncoder(timeoutMs = 5000) {
  try {
    const { stdout } = await runWithTimeout(ffmpegPath, ['-hide_banner', '-encoders'], timeoutMs);
    if (stdout.includes('h264_nvenc')) return 'h264_nvenc';
    if (stdout.includes('h264_qsv')) return 'h264_qsv';
    if (stdout.includes('h264_amf')) return 'h264_amf';
  } catch {}
  return null;
}

/**
 * Transcode video to WhatsApp-compliant format
 */
export async function transcode(input, output, hwEncoder, timeoutMs = 120000) {
  const videoArgs = hwEncoder
    ? ['-c:v', hwEncoder]
    : ['-c:v', 'libx264', '-preset', 'ultrafast'];

  await runWithTimeout(ffmpegPath, [
    '-y',
    '-threads', '2',
    '-i', input,
    ...videoArgs,
    '-profile:v', 'baseline',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-dn', '-sn',
    output,
  ], timeoutMs);
}

/**
 * Main entry point: convert ONLY when needed.
 *  - already h264/yuv420p + aac  -> returns the input untouched (no ffmpeg run)
 *  - h264 video, other audio     -> copy video, re-encode audio only (fast)
 *  - anything else               -> full transcode
 * Falls back to the original file on failure/timeout.
 */
export async function ensurePlayable(input, output) {
  try {
    const { video, audio } = await probe(input, 10000);
    if (!video) return input;
    const vOk = video.codec_name === 'h264' && (!video.pix_fmt || video.pix_fmt === 'yuv420p');
    const aOk = !audio || audio.codec_name === 'aac';
    if (vOk && aOk) {
      if (/\.(mp4|m4v|mov)$/i.test(input)) return input;
      // Right codecs, wrong container -> fast copy-remux into mp4
      await remux(input, output, 30000);
      return output;
    }

    if (vOk) {
      await runWithTimeout(ffmpegPath, [
        '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-dn', '-sn', output,
      ], 60000);
      return output;
    }

    const hw = await getHwEncoder(5000);
    try {
      await transcode(input, output, hw, 120000);
    } catch (err) {
      if (!hw) throw err;
      await transcode(input, output, null, 120000);
    }
    return output;
  } catch (err) {
    console.warn('[ensurePlayable] failed, using original video:', err.message);
    return input;
  }
}

/**
 * Audio for WhatsApp. Checks the real codec (not just the extension):
 * AAC (m4a/mp4/aac), MP3, and Opus-in-ogg are sent as-is; anything else -> AAC m4a.
 * Returns { path, mimetype }.
 */
export async function ensureAudio(input, output) {
  const ext = input.split('.').pop().toLowerCase();
  try {
    const { audio } = await probe(input, 10000);
    const codec = audio?.codec_name;
    if (codec === 'aac' && ['m4a', 'mp4', 'aac'].includes(ext)) return { path: input, mimetype: ext === 'aac' ? 'audio/aac' : 'audio/mp4' };
    if (codec === 'mp3' && ext === 'mp3') return { path: input, mimetype: 'audio/mpeg' };
    if (codec === 'opus' && ext === 'ogg') return { path: input, mimetype: 'audio/ogg; codecs=opus' };
  } catch {}
  const out = output.replace(/\.\w+$/, '') + '.m4a';
  await runWithTimeout(ffmpegPath, ['-y', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], 90000);
  return { path: out, mimetype: 'audio/mp4' };
}
