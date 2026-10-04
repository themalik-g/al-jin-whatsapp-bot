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
import { BUILTIN_ESM_SECRET, BUILTIN_ESM_API_KEY, BUILTIN_ESM_FP_ID } from './esm-secrets.js';

const ESM_BASE = 'https://esm.apiis.dpdns.org';
const ESM_HOST = new URL(ESM_BASE).hostname;
const REQUEST_TIMEOUT_MS = 15000;
const MIN_MEDIA_BYTES = 100 * 1024; // smaller = an error page, not media

// YouTube endpoints. The first six are the order the working bot (King) uses;
// the rest are extra engines listed on the ESM site (ytdl5-7 = Zapcap / VidsSave / ytdown.to,
// ytv / ytvid / mp4 = direct MP4 extractors).
export const YT_ENDPOINTS = [
  '/youtube/bot',
  '/youtube/ytdl2',
  '/youtube/yt',
  '/youtube/ytdl',
  '/youtube/ytdl4',
  '/youtube/download',
  '/youtube/ytdl5',
  '/youtube/ytdl6',
  '/youtube/ytdl7',
  '/youtube/ytv',
  '/youtube/ytvid',
  '/youtube/mp4',
];
let ytLast = null; // endpoint that worked last time → tried first next time
const ytOrder = () => (ytLast ? [ytLast, ...YT_ENDPOINTS.filter((e) => e !== ytLast)] : YT_ENDPOINTS);

// Other downloader families on the site (all take ?url=).
export const ESM_CHAINS = {
  tiktok: ['/tiktok/ttdl', '/tiktok/ttdl2', '/tiktok/ttdl3'],
  facebook: ['/facebook/fbdl', '/facebook/fbdl2', '/facebook/fbdl3', '/facebook/fbdl4'],
  aio: ['/downloader/aio', '/downloader/aio2'],
};

const PRIMARY_UA = 'KING B2K - MD BOT/2.0';
const UBUNTU_UA = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DOWNLOAD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let uaIdx = 0; // remembers which User-Agent worked last

// `.setvar` writes to process.env, keys.env is read by getKey — accept both.
function setting(name) {
  return process.env[name] || getKey(name) || null;
}

export function getEsmApiKey() {
  return setting('ESM_API_KEY') || BUILTIN_ESM_API_KEY;
}

export function getEsmSecret() {
  return setting('ESM_INTERNAL_SECRET') || BUILTIN_ESM_SECRET;
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
  // A successful reply (status:true / ok data) is never a refusal, even if a title says "blocked".
  if (parsed.data && (parsed.data.status === true || parsed.data.success === true)) return false;
  const blob = parsed.data ? JSON.stringify(parsed.data).slice(0, 300) : String(parsed.text || '').slice(0, 300);
  return /access denied|forbidden|unauthori[sz]ed|invalid (api )?key|invalid secret|just a moment/i.test(blob);
}

/** Credential sets to try: whatever .setvar / keys.env supplied first, then the built-in ones. */
function credentialSets() {
  const sets = [];
  const add = (secret, key) => {
    if (!sets.some((c) => c.secret === secret && c.key === key)) sets.push({ secret, key });
  };
  add(getEsmSecret(), getEsmApiKey());
  add(BUILTIN_ESM_SECRET, BUILTIN_ESM_API_KEY);
  return sets;
}

/**
 * Call any ESM endpoint. If a request is refused it retries with the next
 * User-Agent, then with the built-in credentials (in case a stale value was
 * saved through .setvar / keys.env). Result: { ok, status, data | text, denied, endpoint }.
 */
export async function fetchEsmApi(endpoint, params = {}, opts = {}) {
  const baseUrl = endpoint.startsWith('http') ? endpoint : `${ESM_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const custom = opts.headers || null;           // full header set supplied by caller (Instagram)
  const list = custom ? [null] : userAgents();
  let last = { ok: false, status: 0, text: 'no response', denied: false, endpoint };

  for (const cred of credentialSets()) {
    const urlObj = new URL(baseUrl);
    if (!urlObj.searchParams.has('apikey')) urlObj.searchParams.set('apikey', cred.key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) urlObj.searchParams.set(k, v);
    }
    const url = urlObj.toString();

    for (let i = 0; i < list.length; i++) {
      let headers;
      if (custom) {
        headers = { ...custom };
        if (cred.secret) headers['x-internal-secret'] = cred.secret;
      } else {
        const ua = list[(uaIdx + i) % list.length];
        headers = { 'User-Agent': ua, Accept: 'application/json' };
        if (cred.secret) headers['x-internal-secret'] = cred.secret;
      }
      try {
        const res = await timedFetch(url, headers);
        const ct = res.headers.get('content-type') || '';
        const parsed = /^(image|video|audio)\//i.test(ct)
          ? { binary: Buffer.from(await res.arrayBuffer()), contentType: ct }
          : parseBody(await res.text(), ct);
        const denied = looksDenied(res.status, parsed);
        last = { ok: res.ok, status: res.status, ...parsed, denied, endpoint };
        if (!denied) {
          if (!custom) uaIdx = (uaIdx + i) % list.length;
          return last;
        }
      } catch (e) {
        // network problem: other User-Agents / credentials will not help
        return { ok: false, status: 0, text: e.name === 'AbortError' ? 'request timed out' : e.message, denied: false, endpoint };
      }
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
    return `ESM API refused the request (HTTP ${res.status}${detail ? `: ${detail}` : ''}). The secret may be revoked or this server's IP is blocked.`;
  }
  if (res.status === 429) return 'ESM API rate limit reached — try again in a minute.';
  return detail ? `${detail} (HTTP ${res.status})` : `HTTP ${res.status}`;
}

const asUrl = (x) => (typeof x === 'string' && /^https?:\/\//i.test(x) ? x : null);

/** Pull every plausible download link out of one ESM reply object. */
function extractLinks(r) {
  if (typeof r === 'string') return asUrl(r) ? [r] : [];
  if (!r || typeof r !== 'object') return [];
  const pool = [r.download_url, r.dlUrl, r.url, r.video, r.download, r.downloadUrl, r.link, r.audio, r.data?.url, r.data?.download_url];
  return [...new Set(pool.map(asUrl).filter(Boolean))];
}

/**
 * Ask ESM for a YouTube download link. Tries every YouTube endpoint in order;
 * a refused / failing endpoint never stops the others (same as the working bot).
 * Returns { links, title, author, duration, endpoint, quality }.
 * Throws ONE readable Error (err.denied = true only when EVERY endpoint refused us).
 */
export async function fetchEsmYoutube(videoUrl, { type = 'video', quality = '720' } = {}) {
  let lastErr = null; let lastDenied = null; let tried = 0; let denied = 0;
  for (const ep of ytOrder()) {
    tried++;
    const res = await fetchEsmApi(ep, { url: videoUrl, quality, type });
    if (res.denied) {
      denied++;
      lastDenied = `${ep}: ${esmErrorMessage(res)}`;
      continue;
    }
    if (!res.ok || !res.data || !res.data.status) {
      lastErr = new Error(`${ep}: ${esmErrorMessage(res)}`);
      continue;
    }
    const r = res.data.result ?? res.data;
    const links = extractLinks(r);
    if (!links.length) { lastErr = new Error(`${ep}: no download link in reply`); continue; }
    ytLast = ep;
    return {
      links,
      title: r.title || null,
      author: r.channelTitle || r.author || null,
      duration: r.videoTime || r.duration || null,
      endpoint: ep,
      quality,
    };
  }
  if (denied === tried) {
    const err = new Error(lastDenied);
    err.denied = true;
    throw err;
  }
  throw lastErr || new Error('ESM returned no download link.');
}

/** true when the downloaded file is really an HTML / JSON error page. */
export function isErrorPage(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64);
    const n = fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8').trimStart();
    return head.startsWith('<') || head.startsWith('{');
  } catch { return false; }
}

/**
 * Full flow: get link(s) → download to `dest` → verify it is real media.
 * Tries each quality in turn (smaller ones help when the file is too big or a
 * node is saturated). Deletes `dest` on failure. Returns the info object.
 */
export async function esmYoutubeDownload(videoUrl, dest, { type = 'video', qualities = ['720', '480', '360', '144'], maxBytes = 80 * 1024 * 1024, budgetMs = 120000 } = {}) {
  let lastErr = null;
  const deadline = Date.now() + budgetMs;
  for (const quality of qualities) {
    if (Date.now() > deadline) { lastErr = lastErr || new Error('ESM took too long'); break; }
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
        if (size < MIN_MEDIA_BYTES || isErrorPage(dest)) throw new Error('download was an error page, not media');
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
export const IG_ENDPOINTS = ['igdl', 'igdl2', 'igdl3', 'igdl4', 'dl', 'instagramdl', 'dl2', 'dl3', 'dl4'];

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
  const fp = setting('ESM_FP_ID') || BUILTIN_ESM_FP_ID;
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
    if (!e || typeof e !== 'object') return;
    const direct = e.url || e.link || e.download_url || e.dllink || e.video || e.image;
    if (direct) return push(direct, e.type || e.contentType);
    // numbered shape: { link1: '…', contentType1: 'video/mp4', link2: … }
    for (const k of Object.keys(e)) {
      const m = /^link(\d*)$/.exec(k);
      if (m) push(e[k], e[`contentType${m[1]}`] || e.type);
    }
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
  let lastErr = null; let lastDenied = null; let attempts = 0; let denied = 0;
  for (const ep of IG_ENDPOINTS) {
    for (const param of (ep.startsWith('igdl') ? ['url'] : ['url', 'link'])) {
      attempts++;
      const res = await fetchEsmApi(`/instagram/${ep}`, { [param]: postUrl }, { headers });
      if (res.denied) {
        denied++;
        lastDenied = `${ep}: ${esmErrorMessage(res)}`;
        // everything refused so far → the key/IP is blocked, stop hammering
        if (denied === attempts && attempts >= 6) {
          const err = new Error(lastDenied);
          err.denied = true;
          throw err;
        }
        continue;
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
  throw lastErr || (lastDenied ? new Error(lastDenied) : new Error('ESM returned no Instagram media.'));
}

/** Headers for downloading an Instagram CDN file. */
export function instagramDownloadHeaders() {
  return { 'User-Agent': DOWNLOAD_UA, Referer: 'https://www.instagram.com/' };
}


// ── Generic helpers for the other ESM families ─────────────
const SKIP_KEY = /thumb|cover|poster|avatar|profile|icon|preview|music|author|logo/i;
const KEY_RANK = ['nowm', 'no_watermark', 'hdplay', 'hd', 'high', 'dllink', 'download_url', 'download', 'play', 'video', 'url', 'link', 'sd', 'low'];

/** Find the first array hiding in a reply: result / results / data / videos / items. */
export function esmFindArray(p) {
  if (Array.isArray(p)) return p;
  if (p && typeof p === 'object') {
    for (const k of ['result', 'results', 'data', 'videos', 'items']) {
      const a = esmFindArray(p[k]);
      if (a && a.length) return a;
    }
  }
  return null;
}

/**
 * Deep-scan any reply for downloadable links. Returns [{ url, key, isVideo }],
 * videos first, best-named keys (nowm / hd / download_url …) first, thumbnails skipped.
 */
export function pickMediaUrls(payload) {
  const out = []; const seen = new Set();
  const visit = (node, key, depth) => {
    if (node == null || depth > 6) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) && !SKIP_KEY.test(key) && !seen.has(node)) {
        seen.add(node);
        out.push({ url: node, key, isVideo: /\.(mp4|webm|mov)(\?|$)/i.test(node) || /video/i.test(`${node} ${key}`) });
      }
      return;
    }
    if (Array.isArray(node)) { node.forEach((n) => visit(n, key, depth + 1)); return; }
    if (typeof node === 'object') for (const [k, v] of Object.entries(node)) visit(v, k, depth + 1);
  };
  visit(payload, '', 0);
  const rank = (k) => { const i = KEY_RANK.indexOf(String(k).toLowerCase()); return i < 0 ? 99 : i; };
  return out.sort((a, b) => (Number(b.isVideo) - Number(a.isVideo)) || (rank(a.key) - rank(b.key)));
}

/**
 * Try every endpoint of one or more families (ESM_CHAINS keys) until one returns links.
 * A refused / empty endpoint never stops the next one. Returns ranked [{ url, isVideo, endpoint }].
 */
export async function fetchEsmMedia(chainNames, mediaUrl) {
  const eps = [].concat(chainNames).flatMap((n) => ESM_CHAINS[n] || []);
  let lastErr = null; let lastDenied = null; let denied = 0;
  for (const ep of eps) {
    const res = await fetchEsmApi(ep, { url: mediaUrl });
    if (res.denied) { denied++; lastDenied = `${ep}: ${esmErrorMessage(res)}`; continue; }
    if (!res.ok || !res.data || res.data.status === false || res.data.success === false || res.data.error) {
      lastErr = new Error(`${ep}: ${esmErrorMessage(res)}`);
      continue;
    }
    const links = pickMediaUrls(res.data.result ?? res.data.data ?? res.data);
    if (links.length) return links.map((l) => ({ ...l, endpoint: ep }));
    lastErr = new Error(`${ep}: no download link in reply`);
  }
  if (eps.length && denied === eps.length) {
    const err = new Error(lastDenied);
    err.denied = true;
    throw err;
  }
  throw lastErr || new Error('ESM returned no download link.');
}

const toSearchItem = (x) => {
  if (!x || typeof x !== 'object') return null;
  const raw = asUrl(x.url) || asUrl(x.link);
  const id = x.videoId || x.id || (raw && (raw.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1]) || '';
  if (!id && !raw) return null;
  const who = x.author?.name || (typeof x.author === 'string' ? x.author : '') || x.channel?.name || (typeof x.channel === 'string' ? x.channel : '') || x.channelTitle || '';
  return {
    id,
    title: x.title || x.name || 'Video',
    duration: String(x.timestamp || x.duration || x.lengthText || x.videoTime || ''),
    channel: who,
    url: id ? `https://youtu.be/${id}` : raw,
  };
};

/** YouTube keyword search through ESM (/youtube/yts and friends). Returns [{ id, title, duration, channel, url }]. */
export async function esmYoutubeSearch(query, limit = 5) {
  let lastErr = null;
  for (const ep of ['/youtube/yts', '/youtube/ytsearch', '/youtube/search', '/youtube/search2', '/youtube/ytsearch2']) {
    const res = await fetchEsmApi(ep, { url: query, q: query, query });
    if (res.denied) { lastErr = new Error(`${ep}: ${esmErrorMessage(res)}`); continue; }
    if (!res.ok || !res.data) { lastErr = new Error(`${ep}: ${esmErrorMessage(res)}`); continue; }
    const arr = esmFindArray(res.data) || [];
    const items = arr.map(toSearchItem).filter(Boolean);
    if (items.length) return items.slice(0, limit);
    lastErr = new Error(`${ep}: no results`);
  }
  throw lastErr || new Error('ESM search returned nothing.');
}
