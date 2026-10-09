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
import { getMaxDownloadBytes, getVideoHeight, fmtMB } from '../core/limits.js';

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

// ── result typing / normalising (the SDK may say subjectType 1|2, type 'movie'|'tv', isSeries …) ──
const SERIES_RE = /series|tv|show|season/;
export function itemKind(it = {}) {
  if (it.isSeries === true || it.is_series === true) return 'series';
  if (it.isSeries === false || it.is_series === false) return 'movie';
  const raw = it.subjectType ?? it.subject_type ?? it.type ?? it.kind ?? '';
  const t = String(raw).toLowerCase().replace(/[\s_-]+/g, '');
  if (t === '2' || SERIES_RE.test(t)) return 'series';
  if (t === '1' || /movie|film/.test(t)) return 'movie';
  if (Array.isArray(it.seasons) && it.seasons.length) return 'series';
  return '';                                   // unknown → kept for both kinds instead of being hidden
}

export function normalizeItem(r = {}) {
  const year = r.year || String(r.releaseDate || r.release_date || '').slice(0, 4);
  return {
    title: r.title || r.name || 'Untitled',
    detailPath: r.detailPath || r.path || r.id || r.subjectId,
    year: year ? String(year) : '',
    kind: itemKind(r),
    raw: r,
  };
}

const pageItems = (res) => res?.results || res?.items || res?.list || res?.data?.items || res?.data?.results || [];

/**
 * Search Moviebox for movies or TV series. Reads up to `pages` result pages (deduplicated),
 * so long result lists are not cut to the first page.
 */
export async function searchMoviebox(query, kind = 'movie', { pages = 3 } = {}) {
  const session = createMovieboxSession();
  const all = []; const seen = new Set();
  for (let page = 1; page <= pages; page++) {
    let items;
    try {
      items = pageItems(await withRetry(() => search(session, { query, page }), page === 1 ? 2 : 0));
    } catch (e) {
      if (page === 1) throw e;
      break;
    }
    let fresh = 0;
    for (const it of items) {
      const k = String(it.detailPath || it.path || it.id || `${it.title}|${it.year}`);
      if (seen.has(k)) continue;
      seen.add(k); all.push(it); fresh++;
    }
    if (!fresh) break;                          // SDK ignored `page`, or no more results
  }
  const fits = all.filter((it) => { const k = itemKind(it); return !k || k === kind; });
  return fits.length ? fits : all;
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

/** Seasons + episode counts from the SDK's series details (shape differs between versions). */
export function getSeasons(details = {}) {
  const d = details?.data ?? details ?? {};
  const src = d.seasons || d.resource?.seasons || d.subject?.seasons || d.series?.seasons || [];
  const out = [];
  for (const s of Array.isArray(src) ? src : []) {
    const n = Number(s?.se ?? s?.season ?? s?.seasonNumber ?? s?.number ?? s?.index);
    if (!n) continue;
    const e = s.maxEp ?? s.episodeCount ?? s.totalEpisodes ?? s.episodes ?? s.eps;
    out.push({ season: n, episodes: Array.isArray(e) ? e.length : (Number(e) || 0) });
  }
  if (!out.length) {
    const flat = d.episodes || d.list || [];
    if (Array.isArray(flat) && flat.length) {
      const by = new Map();
      for (const ep of flat) { const sn = Number(ep?.season ?? ep?.se) || 1; by.set(sn, (by.get(sn) || 0) + 1); }
      for (const [season, episodes] of by) out.push({ season, episodes });
    }
  }
  return out.sort((a, b) => a.season - b.season);
}

const urlOf = (r) => (typeof r === 'string' ? r : r?.stream?.url || r?.url);

/** 'best' = the highest quality that is within the .dlcap height limit; falls back to the SDK's own 'best'. */
async function bestWithinHeight(get) {
  const ladder = [1080, 720, 480, 360].filter((h) => h <= getVideoHeight());
  for (const h of ladder) {
    try { const r = await get(`${h}p`); if (urlOf(r)) return r; } catch { /* quality not offered → next */ }
  }
  return withRetry(() => get('best'));
}

/** Gets stream URL for a movie with a given quality */
export async function getMovieboxMovieStream(detailPath, quality = 'best') {
  const get = (q) => getMovieStreamUrl(createMovieboxSession(), { detailPath, quality: q });
  return quality === 'best' ? bestWithinHeight(get) : withRetry(() => get(quality));
}

/** Gets stream URL for a series episode with a given quality */
export async function getMovieboxEpisodeStream(detailPath, season, episode, quality = 'best') {
  const get = (q) => getEpisodeStreamUrl(createMovieboxSession(), { detailPath, season, episode, quality: q });
  return quality === 'best' ? bestWithinHeight(get) : withRetry(() => get(quality));
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
