// ─────────────────────────────────────────────
// Al-Jin · lib/esm.js
// Client for https://esm.apiis.dpdns.org/ (OLDUSER API)
//
// Request format copied from a bot that is known to work with this site:
//   GET <base><endpoint>?apikey=…&url=…&quality=…&type=…
//   headers: x-internal-secret, User-Agent, Accept: application/json
//   (no cookies, no Origin/Referer on the API call)
//
// Setup: put ESM_INTERNAL_SECRET (and ESM_FP_ID) in keys.env — it is gitignored.
//   (or, as owner in WhatsApp:  .setvar ESM_INTERNAL_SECRET <value>)
// Optional:  ESM_API_KEY (default "free100"), ESM_USER_AGENT
// Never throws on HTTP errors: returns { ok, status, data|text, denied }.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import { getKey } from '../core/keys.js';
import { downloadToFile } from './net.js';

const ESM_BASE = 'https://esm.apiis.dpdns.org';
const ESM_HOST = new URL(ESM_BASE).hostname;
const REQUEST_TIMEOUT_MS = 15000;
const MIN_MEDIA_BYTES = 100 * 1024; // smaller = an error page, not media

// YouTube endpoints, in the order the working bot tries them.
export const YT_ENDPOINTS = [
  '/youtube/bot',
  '/youtube/ytdl2',
  '/youtube/yt',
  '/youtube/ytdl',
  '/youtube/ytdl4',
  '/youtube/download',
];

const PRIMARY_UA = 'KING B2K - MD BOT/2.0';
const UBUNTU_UA = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DOWNLOAD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let uaIdx = 0; // remembers which User-Agent worked last

// `.setvar` writes to process.env, keys.env is read by getKey — accept both.
function setting(name) {
  return process.env[name] || getKey(name) || null;
}

export function getEsmApiKey() {
  return setting('ESM_API_KEY') || 'free100';
}

export function getEsmSecret() {
  return setting('ESM_INTERNAL_SECRET');
}

export function isEsmUrl(url) {
  try { return new URL(url).hostname === ESM_HOST; } catch { return false; }
}

function userAgents() {
  const custom = setting('ESM_USER_AGENT');
  return custom ? [custom, PRIMARY_UA, UBUNTU_UA] : [PRIMARY_UA, UBUNTU_UA];
}

/** Headers for downloading the media file the API pointed us to. */
export function esmDownloadHeaders() {
  return { 'User-Agent': DOWNLOAD_UA, Referer: 'https://youtube.com/' };
}

async function timedFetch(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseBody(text, contentType) {
  if (/json/i.test(contentType) || /^\s*[\[{]/.test(text)) {
    try { return { data: JSON.parse(text) }; } catch { /* not JSON */ }
  }
  return { text };
}

function looksDenied(status, parsed) {
  if (status === 401 || status === 403) return true;
  const blob = parsed.data ? JSON.stringify(parsed.data).slice(0, 300) : String(parsed.text || '').slice(0, 300);
  return /access denied|forbidden|unauthori[sz]ed|invalid (api )?key|blocked|just a moment/i.test(blob);
}

/**
 * Call any ESM endpoint. If the first User-Agent is refused it retries once
 * with the next one. Result: { ok, status, data | text, denied, endpoint }.
 */
export async function fetchEsmApi(endpoint, params = {}, opts = {}) {
  const urlObj = new URL(endpoint.startsWith('http') ? endpoint : `${ESM_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);
  if (!urlObj.searchParams.has('apikey')) urlObj.searchParams.set('apikey', getEsmApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) urlObj.searchParams.set(k, v);
  }
  const url = urlObj.toString();
  const secret = getEsmSecret();
  const custom = opts.headers || null;           // full header set supplied by caller (Instagram)
  const list = custom ? [null] : userAgents();
  let last = { ok: false, status: 0, text: 'no response', denied: false, endpoint };

  for (let i = 0; i < list.length; i++) {
    let headers;
    if (custom) {
      headers = { ...custom };
    } else {
      const ua = list[(uaIdx + i) % list.length];
      headers = { 'User-Agent': ua, Accept: 'application/json' };
      if (secret) headers['x-internal-secret'] = secret;
    }
    try {
      const res = await timedFetch(url, headers);
      const parsed = parseBody(await res.text(), res.headers.get('content-type') || '');
      const denied = looksDenied(res.status, parsed);
      last = { ok: res.ok, status: res.status, ...parsed, denied, endpoint };
      if (!denied) {
        if (!custom) uaIdx = (uaIdx + i) % list.length;
        return last;
      }
    } catch (e) {
      last = { ok: false, status: 0, text: e.name === 'AbortError' ? 'request timed out' : e.message, denied: false, endpoint };
      break; // network problem: another User-Agent will not help
    }
  }
  return last;
}

/** One short, readable sentence for any failed fetchEsmApi() result. */
export function esmErrorMessage(res) {
  if (!res) return 'No response from ESM API.';
  const fromJson = res.data && (res.data.error || res.data.message || res.data.msg);
  const raw = fromJson ? String(fromJson) : String(res.text || '').replace(/\s+/g, ' ');
  const detail = raw.slice(0, 120);
  if (res.denied) {
    return getEsmSecret()
      ? `ESM API refused the request (HTTP ${res.status}${detail ? `: ${detail}` : ''}). The secret may be wrong or revoked.`
      : 'ESM API needs the access secret. Owner: send `.setvar ESM_INTERNAL_SECRET <value>`';
  }
  if (res.status === 429) return 'ESM API rate limit reached — try again in a minute.';
  return detail ? `${detail} (HTTP ${res.status})` : `HTTP ${res.status}`;
}

/**
 * Ask ESM for a YouTube download link. Tries every YouTube endpoint in order.
 * Returns { links, title, author, duration, endpoint, quality }.
 * Throws ONE readable Error (err.denied = true when the server refused us).
 */
export async function fetchEsmYoutube(videoUrl, { type = 'video', quality = '720' } = {}) {
  let lastErr = null;
  for (const ep of YT_ENDPOINTS) {
    const res = await fetchEsmApi(ep, { url: videoUrl, quality, type });
    if (res.denied) {
      const err = new Error(esmErrorMessage(res));
      err.denied = true;
      throw err; // same key/secret on every endpoint — stop here
    }
    if (!res.ok || !res.data || !res.data.status) {
      lastErr = new Error(`${ep}: ${esmErrorMessage(res)}`);
      continue;
    }
    const r = res.data.result ?? res.data;
    const links = [r.download_url, r.dlUrl, r.url, r.video].filter((x) => typeof x === 'string' && x);
    if (!links.length) { lastErr = new Error(`${ep}: no download link in reply`); continue; }
    return {
      links,
      title: r.title || null,
      author: r.channelTitle || r.author || null,
      duration: r.videoTime || r.duration || null,
      endpoint: ep,
      quality,
    };
  }
  throw lastErr || new Error('ESM returned no download link.');
}

/**
 * Full flow: get link(s) → download to `dest` → verify it is real media.
 * Tries each quality in turn (a smaller one helps when the file is too big).
 * Deletes `dest` on failure. Returns the info object from fetchEsmYoutube.
 */
export async function esmYoutubeDownload(videoUrl, dest, { type = 'video', qualities = ['720', '360'], maxBytes = 80 * 1024 * 1024 } = {}) {
  let lastErr = null;
  for (const quality of qualities) {
    let info;
    try {
      info = await fetchEsmYoutube(videoUrl, { type, quality });
    } catch (e) {
      if (e.denied) throw e;
      lastErr = e;
      continue;
    }
    for (const link of info.links) {
      try {
        await downloadToFile(link, dest, maxBytes, 5, esmDownloadHeaders());
        const size = fs.statSync(dest).size;
        if (size < MIN_MEDIA_BYTES) throw new Error('download was an error page, not media');
        return info;
      } catch (e) {
        lastErr = e;
        try { fs.unlinkSync(dest); } catch {}
      }
    }
  }
  throw lastErr || new Error('Could not download from ESM.');
}

// ── Instagram ────────────────────────────────
// Endpoint names and header set copied from the working bot.
export const IG_ENDPOINTS = ['dl', 'instagramdl', 'igdl', 'dl2', 'igdl2', 'dl3', 'igdl3', 'dl4', 'igdl4'];

function instagramHeaders() {
  const h = {
    accept: '*/*',
    'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    Referer: `${ESM_BASE}/`,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
  };
  const secret = getEsmSecret();
  const fp = setting('ESM_FP_ID');
  if (secret) h['x-internal-secret'] = secret;
  if (fp) h['x-fp-id'] = fp;
  return h;
}

const looksVideo = (u, t) => /\.mp4|video/i.test(`${u} ${t || ''}`);

/** Turn the many reply shapes of the Instagram endpoints into [{ url, isVideo }]. */
export function normalizeInstagramResult(result) {
  const items = [];
  const push = (u, t) => { if (typeof u === 'string' && /^https?:\/\//i.test(u)) items.push({ url: u, isVideo: looksVideo(u, t) }); };
  const fromEntry = (e) => {
    if (typeof e === 'string') return push(e);
    if (e && typeof e === 'object') push(e.url || e.link || e.download_url, e.type || e.contentType);
  };
  if (Array.isArray(result)) result.forEach(fromEntry);
  else if (result && typeof result === 'object') {
    if (result.links && typeof result.links === 'object') Object.values(result.links).forEach(fromEntry);
    else if (Object.keys(result).some((k) => /^\d+$/.test(k))) Object.values(result).forEach(fromEntry);
    else fromEntry(result);
  }
  // if there is at least one video, drop plain thumbnails
  const seen = new Set();
  const uniq = items.filter((i) => (seen.has(i.url) ? false : seen.add(i.url)));
  return uniq.some((i) => i.isVideo) ? uniq.filter((i) => i.isVideo) : uniq;
}

/**
 * Get downloadable media links for an Instagram post/reel/story URL.
 * Returns [{ url, isVideo }]. Throws ONE readable Error (err.denied when refused).
 */
export async function fetchEsmInstagram(postUrl) {
  const headers = instagramHeaders();
  let lastErr = null;
  for (const ep of IG_ENDPOINTS) {
    for (const param of ['url', 'link']) {
      const res = await fetchEsmApi(`/instagram/${ep}`, { [param]: postUrl }, { headers });
      if (res.denied) {
        const err = new Error(esmErrorMessage(res));
        err.denied = true;
        throw err;
      }
      if (!res.ok || !res.data || !res.data.status || !res.data.result || res.data.result.error) {
        lastErr = new Error(`${ep}: ${esmErrorMessage(res)}`);
        continue;
      }
      const media = normalizeInstagramResult(res.data.result);
      if (media.length) return media;
      lastErr = new Error(`${ep}: no media in reply`);
    }
  }
  throw lastErr || new Error('ESM returned no Instagram media.');
}

/** Headers for downloading an Instagram CDN file. */
export function instagramDownloadHeaders() {
  return { 'User-Agent': DOWNLOAD_UA, Referer: 'https://www.instagram.com/' };
}
