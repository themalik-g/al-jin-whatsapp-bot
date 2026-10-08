// ─────────────────────────────────────────────
//  Al-Jin · lib/stream-send.js
//  Stream a remote video straight into Baileys — no download-to-disk step,
//  flat RAM (backpressure, ~64 KB buffers), no transcoding.
//
//  Honest limit: WhatsApp media is end-to-end encrypted and the upload URL contains the
//  hash of the ENCRYPTED file, so Baileys must write ONE encrypted temp file (in the OS
//  tmp dir) before it uploads. This module makes sure that is the only copy
//  (no plain copy, no second copy of ours), refuses files that will not fit
//  in the free disk, and sweeps leftovers from earlier crashes.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform, pipeline } from 'node:stream';
import { spawn } from 'node:child_process';
import { BROWSER_USER_AGENT } from './net.js';
import { getMaxDownloadBytes, fmtMB } from '../core/limits.js';
import { getSetting } from '../core/settings.js';
import { getVar } from '../core/vars.js';

const MB = 1024 * 1024;
const IDLE_MS = 60_000;

// 16×16 grey JPEG. Giving Baileys a thumbnail stops it from saving an extra *plain* copy of the
// video just to cut a thumbnail out of it (that would double the disk use).
export const THUMB = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKKKKAP/Z',
  'base64',
);

// ── disk room ────────────────────────────────
// Settings (all owner-controlled with the  .disk  command, persisted):
//   tmpDir        'auto' (default) | 'system' | <folder>   where Baileys writes its one temp file
//   diskReserveMB safety margin that is always kept free   (default 150)
//   diskLimitMB   most the bot may use for ONE send         (0 = no extra limit)
//   diskRoomMB    manual "treat this much as free" override (0 = measure)
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
export const reserveBytes = () => (num(getSetting('diskReserveMB')) || num(process.env.AIJIN_DISK_RESERVE_MB) || 150) * MB;
export const wantedTmpDir = () => String(getSetting('tmpDir') || 'auto');
export const botTmpFolder = () => path.join(process.cwd(), 'vault', 'wa-tmp');

async function availOf(dir) {
  try { const s = await fs.promises.statfs(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

const ORIG_TMPDIR = process.env.TMPDIR; // what the host gave us, so "system" / "auto" can go back to it
const setTmp = (v) => { if (v) process.env.TMPDIR = v; else delete process.env.TMPDIR; };

/** Point Baileys' temp folder (os.tmpdir() reads TMPDIR on every call) at the roomiest disk. Returns the folder in use. */
export async function ensureTmpDir() {
  const want = wantedTmpDir();
  if (want !== 'auto' && want !== 'system') {            // explicit folder
    try { fs.mkdirSync(want, { recursive: true }); setTmp(want); } catch { /* keep current */ }
    return os.tmpdir();
  }
  setTmp(ORIG_TMPDIR);                                   // start from what the host gave us
  if (want === 'auto' && !ORIG_TMPDIR) {
    const sys = await availOf(os.tmpdir());
    const here = await availOf(process.cwd());
    if (here != null && (sys == null || here > sys * 1.5) && here > 300 * MB) {
      try { fs.mkdirSync(botTmpFolder(), { recursive: true }); setTmp(botTmpFolder()); } catch { /* keep system */ }
    }
  }
  return os.tmpdir();
}

/** Everything the .disk command shows. */
export async function diskInfo() {
  const dir = await ensureTmpDir();
  return {
    dir, tmpAvail: await availOf(dir), here: await availOf(process.cwd()),
    reserve: reserveBytes(), limit: num(getSetting('diskLimitMB')) * MB, manual: num(getSetting('diskRoomMB')) * MB,
    want: wantedTmpDir(), room: await diskRoomBytes(),
  };
}

/** Free bytes for ONE send: measured free space minus the reserve, bounded by the manual limit; or the manual room override. */
export async function diskRoomBytes() {
  await ensureTmpDir();
  const manual = num(getSetting('diskRoomMB')) * MB;
  let room;
  if (manual) room = manual;
  else {
    const free = await availOf(os.tmpdir());
    room = free == null ? Infinity : Math.max(0, free - reserveBytes());
  }
  const limit = (num(getSetting('diskLimitMB')) || num(process.env.AIJIN_MAX_TMP_MB)) * MB;
  if (limit) room = Math.min(room, limit);
  return room;
}

/** The size a single send may have right now: .dlcap AND what the disk can take. */
export async function effectiveCapBytes() {
  return Math.min(getMaxDownloadBytes(), await diskRoomBytes());
}

// ── leftovers from crashed runs ──────────────
/** Delete half-downloaded files (old build) and orphaned Baileys temp files. ageMs=0 → everything (startup). */
export function purgeLeftovers(ageMs = 15 * 60_000) {
  const now = Date.now();
  const sweep = (dir, test) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (test && !test.test(n)) continue;
      const p = path.join(dir, n);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && now - st.mtimeMs >= ageMs) fs.unlinkSync(p);
      } catch { /* ignore */ }
    }
  };
  sweep(path.join(process.cwd(), 'vault', 'tmp', 'movies'));
  sweep(path.join(process.cwd(), 'vault', 'tmp', 'm3u8'));
  sweep(botTmpFolder(), /^(video|document|image|audio|sticker)[\w-]*-(enc|plain)$/i);
  sweep(os.tmpdir(), /^(video|document|image|audio|sticker)[\w-]*-(enc|plain)$/i);
}
ensureTmpDir().then(() => purgeLeftovers(0)).catch(() => purgeLeftovers(0)); // nothing is running at startup

// ── byte counter / cap / idle watchdog ───────
class Counter extends Transform {
  constructor(maxBytes) {
    super({ highWaterMark: 1024 * 1024 });
    this.bytes = 0; this.max = maxBytes;
    this._arm();
  }
  _arm() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.destroy(new Error('Source went idle (no data for 60 s)')), IDLE_MS);
    this._t.unref?.();
  }
  _transform(chunk, _enc, cb) {
    this.bytes += chunk.length;
    if (this.bytes > this.max) return cb(new Error(`Stream passed the size limit (${fmtMB(this.max)} MB)`));
    this._arm();
    cb(null, chunk);
  }
  _flush(cb) { clearTimeout(this._t); cb(); }
  _destroy(err, cb) { clearTimeout(this._t); cb(err); }
}

export const tooBigText = (size, cap) =>
  `${fmtMB(size)} MB is more than this server can take right now (limit ${fmtMB(cap)} MB — .dlcap and free disk).`;

// ── sources ──────────────────────────────────
// Parallel download: N ranged connections, chunks handed on in order. Memory ≤ ~2N chunks (default 6 × 4 MB ≈ 24 MB).
//   .setvar AIJIN_CONNS 6      → connections per file (1 = off, max 8; default 4)
const CHUNK = 4 * MB;
const connCount = () => Math.min(8, Math.max(1, Math.round(Number(getVar('AIJIN_CONNS') || process.env.AIJIN_CONNS) || 4)));

async function getWithTimeout(url, headers, ms, signal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: '*/*', ...headers }, redirect: 'follow', signal: ctl.signal });
  } finally { clearTimeout(t); signal?.removeEventListener('abort', onAbort); }
}

/** Yield items 0..count-1 in order while fetching up to `n` at once (window 2n, so memory stays bounded). */
async function* ordered(count, getItem, n) {
  const win = new Map(); let next = 0; let running = 0; const waiters = [];
  const slot = () => new Promise((r) => { if (running < n) { running++; r(); } else waiters.push(r); });
  const release = () => { running--; const w = waiters.shift(); if (w) { running++; w(); } };
  const start = (i) => { win.set(i, (async () => { await slot(); try { return await getItem(i); } finally { release(); } })()); win.get(i).catch(() => {}); };
  try {
    while (next < count && next < n * 2) start(next++);
    for (let i = 0; i < count; i++) {
      const buf = await win.get(i); win.delete(i);
      if (next < count) start(next++);
      yield buf;
    }
  } finally { win.clear(); }
}

async function retry(fn, tries = 3) {
  let last;
  for (let k = 0; k < tries; k++) { try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 500 * (k + 1))); } }
  throw last;
}

/** Open a remote file as a capped Readable. Fast path: parallel ranged download. Throws fast if unreachable or too big. */
export async function openRemote(url, { headers = {}, maxBytes, conns } = {}) {
  const cap = maxBytes ?? await effectiveCapBytes();
  const n = conns ?? connCount();
  const abort = new AbortController();
  const res = await getWithTimeout(url, n > 1 ? { ...headers, Range: `bytes=0-${CHUNK - 1}` } : headers, 25_000);
  if (!res.ok || !res.body) { try { await res.body?.cancel(); } catch {} throw new Error(`HTTP ${res.status}`); }

  const cr = /bytes\s+\d+-\d+\/(\d+)/i.exec(res.headers.get('content-range') || '');
  const total = res.status === 206 && cr ? Number(cr[1]) : 0;
  const size = total || Number(res.headers.get('content-length') || 0);
  if (size && size > cap) { try { await res.body.cancel(); } catch {} throw new Error(tooBigText(size, cap)); }

  const counter = new Counter(cap);
  if (total > CHUNK && n > 1) {                         // server honours Range → N connections
    const first = Buffer.from(await res.arrayBuffer());
    const count = Math.ceil(total / CHUNK);
    const getChunk = (i) => (i === 0 ? Promise.resolve(first) : retry(async () => {
      const s = i * CHUNK; const e = Math.min(total, s + CHUNK) - 1;
      const r = await getWithTimeout(url, { ...headers, Range: `bytes=${s}-${e}` }, 45_000, abort.signal);
      if (r.status !== 206 && !(r.status === 200 && s === 0)) { try { await r.body?.cancel(); } catch {} throw new Error(`HTTP ${r.status} on part ${i}`); }
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length !== e - s + 1) throw new Error(`short part ${i}`);
      return b;
    }));
    const src = Readable.from(ordered(count, getChunk, n), { objectMode: false });
    pipeline(src, counter, () => {});
  } else {                                              // single stream (small file, 1 connection, or no Range support)
    pipeline(Readable.fromWeb(res.body, { highWaterMark: 1024 * 1024 }), counter, () => {});
  }
  counter.on('close', () => abort.abort());
  return { stream: counter, size: total || size };
}

// ── HLS ──────────────────────────────────────
async function fetchText(url, headers) {
  const r = await getWithTimeout(url, headers, 20_000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Simple VOD playlist (no encryption, MPEG-TS) → list of segment URLs + the first segment; otherwise null. */
async function planHls(url, headers) {
  let text = await fetchText(url, headers); let base = url;
  if (/#EXT-X-STREAM-INF/i.test(text)) {                 // master playlist → highest-bandwidth variant
    const lines = text.split(/\r?\n/); let best = null;
    for (let i = 0; i < lines.length; i++) {
      const m = /#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+)/i.exec(lines[i]);
      if (m && lines[i + 1] && !lines[i + 1].startsWith('#') && (!best || Number(m[1]) > best.bw)) best = { bw: Number(m[1]), uri: lines[i + 1].trim() };
    }
    if (!best) return null;
    base = new URL(best.uri, url).href; text = await fetchText(base, headers);
  }
  if (!/#EXTINF/i.test(text) || !/#EXT-X-ENDLIST/i.test(text) || /#EXT-X-MAP/i.test(text) || /#EXT-X-KEY:(?!.*METHOD=NONE)/i.test(text)) return null;
  const segs = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, base).href);
  if (!segs.length) return null;
  const r = await getWithTimeout(segs[0], headers, 30_000);
  if (!r.ok) return null;
  const first = Buffer.from(await r.arrayBuffer());
  return first[0] === 0x47 ? { segs, first } : null;     // 0x47 = MPEG-TS sync byte
}

/** HLS (.m3u8) → fragmented MP4 on stdout with `ffmpeg -c copy` (no re-encode, tiny CPU, no files).
 *  Simple playlists: segments are fetched in parallel and fed to ffmpeg's stdin; anything else: ffmpeg fetches itself. */
export async function openHls(url, { headers = {}, maxBytes, conns } = {}) {
  const cap = maxBytes ?? await effectiveCapBytes();
  const n = conns ?? connCount();
  const { ffmpegPath } = await import('./ffmpeg-resolver.js');
  let plan = null;
  if (n > 1) { try { plan = await planHls(url, headers); } catch (e) { console.warn('[hls] parallel plan failed, ffmpeg will fetch:', e.message); } }

  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
  if (plan) args.push('-f', 'mpegts', '-i', 'pipe:0');
  else {
    const h = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('');
    if (h) args.push('-headers', h);
    args.push('-i', url);
  }
  args.push('-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  const proc = spawn(ffmpegPath || 'ffmpeg', args, { stdio: [plan ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let errTail = '';
  proc.stderr.on('data', (d) => { errTail = (errTail + d).slice(-300); });
  const counter = new Counter(cap);
  proc.stdout.pipe(counter, { end: false });             // end it ourselves, only once ffmpeg's exit code is known
  proc.stdout.on('error', (e) => counter.destroy(e));
  proc.on('error', (e) => counter.destroy(e));
  proc.on('close', (code) => {
    if (code) counter.destroy(new Error(`ffmpeg exited ${code}: ${errTail.trim() || 'stream failed'}`));
    else counter.end();
  });
  const abort = new AbortController();
  counter.on('close', () => { abort.abort(); try { proc.kill('SIGKILL'); } catch {} });
  if (plan) {
    proc.stdin.on('error', () => {});                    // ffmpeg may close early; its exit code tells the story
    const getSeg = (i) => (i === 0 ? Promise.resolve(plan.first) : retry(async () => {
      const r = await getWithTimeout(plan.segs[i], headers, 45_000, abort.signal);
      if (!r.ok) { try { await r.body?.cancel(); } catch {} throw new Error(`HTTP ${r.status} on segment ${i}`); }
      return Buffer.from(await r.arrayBuffer());
    }));
    pipeline(Readable.from(ordered(plan.segs.length, getSeg, n), { objectMode: false }), proc.stdin, (e) => { if (e) counter.destroy(e); });
  }
  return { stream: counter, size: 0 };
}

// ── send ─────────────────────────────────────
/** Hand the stream to Baileys. Always destroys the stream afterwards. */
export async function sendStream(sock, chat, msg, { stream, asDoc, mimetype = 'video/mp4', fileName, caption }) {
  const content = asDoc
    ? { document: { stream }, mimetype, fileName, caption, jpegThumbnail: THUMB }
    : { video: { stream }, mimetype, caption, jpegThumbnail: THUMB };
  try {
    return await sock.sendMessage(chat, content, { quoted: msg, mediaUploadTimeoutMs: 20 * 60_000 });
  } finally {
    try { stream.destroy(); } catch {}
  }
}
