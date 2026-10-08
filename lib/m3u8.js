// ─────────────────────────────────────────────
// Al-Jin · lib/m3u8.js
// Dedicated HLS downloader wrapper (@lzwme/m3u8-dl)
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { m3u8Download, m3u8DLStop, workPollPublic } from '@lzwme/m3u8-dl';
import { ffmpegPath } from './ffmpeg-resolver.js';
import { getMaxDownloadBytes, fmtMB } from '../core/limits.js';

const TMP_M3U8_DIR = path.join(process.cwd(), 'vault', 'tmp', 'm3u8');

/**
 * Closes the background worker pool if active to prevent idle worker handles.
 */
export function closeM3u8Pool() {
  try {
    if (workPollPublic && typeof workPollPublic.close === 'function') {
      workPollPublic.close();
    }
  } catch {}
}

/**
 * Downloads an HLS .m3u8 stream to a local MP4 file.
 * Automatically handles AES-128 decryption, multi-threaded segment downloading,
 * and muxing via FFmpeg.
 *
 * @param {string} url - .m3u8 stream URL
 * @param {object} [opts] - Optional options (headers, filename, outputDir)
 * @returns {Promise<string>} Output file path
 */
export async function downloadHlsStream(url, opts = {}) {
  fs.mkdirSync(TMP_M3U8_DIR, { recursive: true });
  const maxBytes = getMaxDownloadBytes();
  const filename = opts.filename || `hls_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const targetPath = path.join(TMP_M3U8_DIR, `${filename}.mp4`);

  let aborted = false;

  const dlOptions = {
    url,
    saveDir: TMP_M3U8_DIR,
    filename,
    ffmpegPath,
    delCache: true,
    showProgress: false,
    headers: opts.headers || {},
    onProgress: (_finished, _total, _info, stats) => {
      if (stats?.downloadedSize && stats.downloadedSize > maxBytes) {
        aborted = true;
        m3u8DLStop(url);
      }
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(stats);
      }
    },
  };

  try {
    const res = await m3u8Download(url, dlOptions);

    if (aborted) {
      throw new Error(`Download exceeded maximum allowed limit (${fmtMB(maxBytes)} MB)`);
    }

    const finalPath = res?.filepath || targetPath;
    if (!fs.existsSync(finalPath)) {
      throw new Error(res?.errmsg || 'HLS download failed to produce output file');
    }

    const stat = fs.statSync(finalPath);
    if (stat.size > maxBytes) {
      try { fs.unlinkSync(finalPath); } catch {}
      throw new Error(`File size (${fmtMB(stat.size)} MB) exceeds limit (${fmtMB(maxBytes)} MB)`);
    }

    return finalPath;
  } catch (err) {
    m3u8DLStop(url);
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch {}
    }
    throw err;
  } finally {
    closeM3u8Pool();
  }
}
