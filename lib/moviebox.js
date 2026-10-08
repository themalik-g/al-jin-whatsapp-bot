// ─────────────────────────────────────────────
// Al-Jin · lib/moviebox.js
// Moviebox SDK integration with mirror retries and HLS/MP4 streaming
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import {
  MovieboxSession,
  search,
  getMovieDetails,
  getMovieStreamUrl,
  getSeriesDetails,
  getEpisodeQualities,
  getEpisodeStreamUrl,
} from 'moviebox-js-sdk';
import { downloadHlsStream } from './m3u8.js';
import { getMaxDownloadBytes, fmtMB } from '../core/limits.js';

const TMP_MOVIE_DIR = path.join(process.cwd(), 'vault', 'tmp', 'movies');

async function withRetry(fn, maxRetries = 2, delayMs = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export function createMovieboxSession() {
  return new MovieboxSession();
}

/**
 * Search Moviebox for movies or TV series by query string
 */
export async function searchMoviebox(query, kind = 'movie') {
  return withRetry(async () => {
    const session = createMovieboxSession();
    const res = await search(session, { query });
    const items = res?.results || [];
    if (!items.length) return [];

    // Filter by kind if specified
    if (kind === 'series') {
      return items.filter((item) => item.type === 'series' || item.isSeries || /series|tv/i.test(item.type || ''));
    } else if (kind === 'movie') {
      const filtered = items.filter((item) => item.type === 'movie' || !item.isSeries);
      return filtered.length ? filtered : items;
    }
    return items;
  });
}

/**
 * Gets movie details and available stream qualities from Moviebox
 */
export async function getMovieboxMovieDetails(detailPath) {
  return withRetry(async () => {
    const session = createMovieboxSession();
    return await getMovieDetails(session, { detailPath });
  });
}

/**
 * Gets series details and episode list from Moviebox
 */
export async function getMovieboxSeriesDetails(detailPath) {
  return withRetry(async () => {
    const session = createMovieboxSession();
    return await getSeriesDetails(session, { detailPath });
  });
}

/**
 * Gets stream URL for a movie with a given quality
 */
export async function getMovieboxMovieStream(detailPath, quality = 'best') {
  return withRetry(async () => {
    const session = createMovieboxSession();
    return await getMovieStreamUrl(session, { detailPath, quality });
  });
}

/**
 * Gets stream URL for a series episode with a given quality
 */
export async function getMovieboxEpisodeStream(detailPath, season, episode, quality = 'best') {
  return withRetry(async () => {
    const session = createMovieboxSession();
    return await getEpisodeStreamUrl(session, { detailPath, season, episode, quality });
  });
}

/**
 * Streams a Moviebox URL (either direct MP4 or .m3u8 HLS) to a local file.
 * Enforces getMaxDownloadBytes() limit strictly during streaming.
 */
export async function downloadMovieboxStream(streamUrl, options = {}) {
  fs.mkdirSync(TMP_MOVIE_DIR, { recursive: true });
  const maxBytes = getMaxDownloadBytes();
  const safeTitle = (options.title || 'video').replace(/[^\w\s-]/g, '').trim().slice(0, 50);
  const fileName = `mb_${Date.now()}_${safeTitle}.${options.ext || 'mp4'}`;
  const filePath = path.join(TMP_MOVIE_DIR, fileName);

  const urlStr = typeof streamUrl === 'string' ? streamUrl : streamUrl?.stream?.url || streamUrl?.url;
  if (!urlStr) {
    throw new Error('No valid stream URL provided');
  }

  // Check if HLS stream (.m3u8)
  if (urlStr.includes('.m3u8')) {
    return await downloadHlsStream(urlStr, {
      filename: `mb_${Date.now()}_${safeTitle}`,
      headers: options.headers || streamUrl?.headers,
      onProgress: options.onProgress,
    });
  }

  // Direct MP4 / HTTP Stream
  const res = await fetch(urlStr, { headers: options.headers || streamUrl?.headers || {} });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
  }

  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Media size (${fmtMB(contentLength)} MB) exceeds limit (${fmtMB(maxBytes)} MB)`);
  }

  const fileStream = fs.createWriteStream(filePath);
  let downloadedBytes = 0;

  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloadedBytes += value.length;
      if (downloadedBytes > maxBytes) {
        throw new Error(`Downloaded size exceeded maximum allowed limit (${fmtMB(maxBytes)} MB)`);
      }
      fileStream.write(value);
      if (typeof options.onProgress === 'function') {
        options.onProgress({ downloadedSize: downloadedBytes, totalSize: contentLength });
      }
    }
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
      fileStream.end();
    });
  } catch (err) {
    fileStream.destroy();
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    throw err;
  }

  return filePath;
}
