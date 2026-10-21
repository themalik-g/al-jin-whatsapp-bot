// ─────────────────────────────────────────────
//  Al-Jin · lib/ytapi.js
//  Extra YouTube download source (used after yt-dlp and ESM have failed): the David Cyril API —
//  the same endpoints as the ytmp3.js / ytmp4.js plugins:
//     GET <base>/download/ytmp4?url=<youtube url>   → video
//     GET <base>/download/ytmp3?url=<youtube url>   → audio
//  Reply: { result: { download_url | downloadUrl | url, title, thumbnail … } }  or  { url | link }.
//  Base address can be changed with  AL_JIN_YT_API  (variable / environment).
//  fetchApiYoutube()    → { link, title, thumbnail, endpoint }          (no file written)
//  apiYoutubeDownload() → downloads that link to a file and checks it is real media
// ─────────────────────────────────────────────
import fs from 'node:fs';
import { httpGetJson, downloadToFile, BROWSER_USER_AGENT } from './net.js';

export const YT_API_BASE = String(process.env.AL_JIN_YT_API || 'https://apis.davidcyriltech.my.id').replace(/\/+$/, '');
const PATHS = { video: '/download/ytmp4', audio: '/download/ytmp3' };
const MIN_MEDIA_BYTES = 50 * 1024;       // smaller = an error page, not media

function pickLink(data) {
  const r = data?.result;
  const cand = [r?.download_url, r?.downloadUrl, r?.url, r?.link, data?.download_url, data?.url, data?.link];
  return cand.find((x) => typeof x === 'string' && /^https?:\/\//i.test(x)) || null;
}

/** Asks the API for a direct link. Throws one readable Error. */
export async function fetchApiYoutube(videoUrl, { type = 'video', timeout = 30000 } = {}) {
  const path = PATHS[type === 'audio' ? 'audio' : 'video'];
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await httpGetJson(`${YT_API_BASE}${path}?url=${encodeURIComponent(videoUrl)}`, { timeout, headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' } });
      const link = pickLink(data);
      if (!link) throw new Error(data?.message || data?.error || 'no download link in reply');
      const r = data?.result || {};
      return { link, title: r.title || data?.title || null, thumbnail: r.thumbnail || r.image || null, endpoint: 'backup-api' };
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800));
    }
  }
  throw new Error(`backup API: ${lastErr?.message || lastErr}`);
}

function isErrorPage(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64);
    const n = fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8').trimStart();
    return head.startsWith('<') || head.startsWith('{');
  } catch { return false; }
}

/** link → file. Returns { file, title, endpoint }; the file is deleted again when it is not real media. */
export async function apiYoutubeDownload(videoUrl, dest, { type = 'video', maxBytes = 100 * 1024 * 1024 } = {}) {
  const info = await fetchApiYoutube(videoUrl, { type });
  try {
    await downloadToFile(info.link, dest, maxBytes, 5, { 'User-Agent': BROWSER_USER_AGENT });
    const size = fs.statSync(dest).size;
    if (size < MIN_MEDIA_BYTES || isErrorPage(dest)) throw new Error('download was an error page, not media');
    return { file: dest, title: info.title, endpoint: info.endpoint };
  } catch (e) {
    try { fs.unlinkSync(dest); } catch {}
    throw new Error(`backup API: ${e?.message || e}`);
  }
}
