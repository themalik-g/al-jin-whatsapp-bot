// ─────────────────────────────────────────────
//  Al-Jin · lib/yt-chain.js
//  YouTube downloads with fallbacks. Every source is tried in turn until one gives a file:
//     1. yt-dlp (ytdlp-nodejs)            — exact quality / bitrate, best result
//     2. Al-Jin's ESM downloader          — lib/esm.js  (the .jin… commands' engine)
//     3. backup API                       — lib/ytapi.js (David Cyril API)
//  `.play` has more: SoundCloud search inside yt-dlp, and the Spotify downloader as the very last resort.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { runYtdlp } from './ytdlp.js';
import { esmYoutubeDownload } from './esm.js';
import { apiYoutubeDownload } from './ytapi.js';
import { ytSearch } from './ytsearch.js';
import { videoFormat, getMaxDownloadBytes } from '../core/limits.js';

export const AUDIO_FORMAT = 'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b';
export const audioFormat = (abr) => (abr
  ? `ba[ext=m4a][abr<=${abr + 2}]/ba[abr<=${abr + 2}]/ba[ext=m4a]/ba/b`
  : AUDIO_FORMAT);

const ESM_QUALITIES = ['720', '480', '360', '144'];
/** ESM only knows 720 / 480 / 360 / 144 — start at the chosen height (or the next one below). */
export function esmLadder(height) {
  if (!height) return ESM_QUALITIES;
  const down = ESM_QUALITIES.filter((q) => Number(q) <= height);
  return down.length ? down : ['144'];
}

const short = (e) => String(e?.message || e).split('\n')[0].slice(0, 140);

/**
 * Tries the sources one after another. `sources` = [{ name, run: async () => ({ file, ... }) }].
 * Returns { file, via, ...extra } of the first that works; otherwise throws ONE Error listing every failure.
 */
export async function firstWorking(sources, { onTry } = {}) {
  const errors = [];
  for (const s of sources) {
    try {
      if (onTry) { try { onTry(s.name, errors.length); } catch {} }
      const res = await s.run();
      if (res?.file && fs.existsSync(res.file) && fs.statSync(res.file).size > 0) return { ...res, via: s.name };
      errors.push(`${s.name}: no file was created`);
    } catch (e) {
      errors.push(`${s.name}: ${short(e)}`);
      try { console.error(`[yt-chain] ${s.name} failed:`, short(e)); } catch {}
    }
  }
  const err = new Error(`every download source failed — ${errors.join(' | ')}`);
  err.errors = errors;
  throw err;
}

/** The fallbacks need a watch URL; yt-dlp can work from a search term, so resolve one only when needed. */
export function urlResolver({ url, query }) {
  let cached = url || null;
  return async () => {
    if (cached) return cached;
    const hit = (await ytSearch(query, 1))?.[0];
    if (!hit?.url) throw new Error('could not find that video');
    cached = hit.url;
    return cached;
  };
}

export function videoSources({ target, resolve, dir, prefix, height, onProgress }) {
  const template = path.join(dir, `${prefix}_%(title).50s.%(ext)s`);
  const maxBytes = getMaxDownloadBytes();
  return [
    { name: 'yt-dlp', run: async () => ({ file: await runYtdlp(target, dir, prefix, (dl) =>
        dl.addArgs('-f', height ? videoFormat(height) : videoFormat(), '--merge-output-format', 'mp4',
          '--postprocessor-args', 'Merger+ffmpeg:-movflags +faststart', '-o', template), onProgress) }) },
    { name: 'ESM', run: async () => {
        const dest = path.join(dir, `${prefix}_esm.mp4`);
        const info = await esmYoutubeDownload(await resolve(), dest, { type: 'video', qualities: esmLadder(height), maxBytes, budgetMs: 100000 });
        return { file: dest, title: info?.title || null, quality: info?.quality || null };
      } },
    { name: 'backup API', run: async () => {
        const r = await apiYoutubeDownload(await resolve(), path.join(dir, `${prefix}_api.mp4`), { type: 'video', maxBytes });
        return { file: r.file, title: r.title };
      } },
  ];
}

export function audioSources({ target, resolve, dir, prefix, abr, soundcloudQuery, onProgress }) {
  const template = path.join(dir, `${prefix}_%(title).50s.%(ext)s`);
  const maxBytes = getMaxDownloadBytes();
  const list = [
    // Native m4a/aac — no mp3 re-encode.
    { name: 'yt-dlp', run: async () => ({ file: await runYtdlp(target, dir, prefix, (dl) => dl.addArgs('-f', audioFormat(abr), '-o', template), onProgress) }) },
  ];
  if (soundcloudQuery) {
    list.push({ name: 'SoundCloud', run: async () => ({ file: await runYtdlp(`scsearch1:${soundcloudQuery}`, dir, prefix, (dl) => dl.addArgs('-f', AUDIO_FORMAT, '-o', template), onProgress) }) });
  }
  list.push(
    { name: 'ESM', run: async () => {
        const dest = path.join(dir, `${prefix}_esm.mp3`);
        const info = await esmYoutubeDownload(await resolve(), dest, { type: 'audio', qualities: ['720'], maxBytes, budgetMs: 100000 });
        return { file: dest, title: info?.title || null };
      } },
    { name: 'backup API', run: async () => {
        const r = await apiYoutubeDownload(await resolve(), path.join(dir, `${prefix}_api.mp3`), { type: 'audio', maxBytes });
        return { file: r.file, title: r.title };
      } },
  );
  return list;
}
