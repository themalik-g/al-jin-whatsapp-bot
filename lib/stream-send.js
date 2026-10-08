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
    super({ highWaterMark: 64 * 1024 });
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
/** Open a remote file as a capped Readable. Throws fast if the URL is unreachable or already too big. */
export async function openRemote(url, { headers = {}, maxBytes } = {}) {
  const cap = maxBytes ?? await effectiveCapBytes();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: '*/*', ...headers }, redirect: 'follow', signal: ctl.signal });
  } finally { clearTimeout(t); }
  if (!res.ok || !res.body) { try { await res.body?.cancel(); } catch {} throw new Error(`HTTP ${res.status}`); }
  const size = Number(res.headers.get('content-length') || 0);
  if (size && size > cap) { try { await res.body.cancel(); } catch {} throw new Error(tooBigText(size, cap)); }
  const counter = new Counter(cap);
  pipeline(Readable.fromWeb(res.body, { highWaterMark: 64 * 1024 }), counter, () => {});
  return { stream: counter, size };
}

/** HLS (.m3u8) → fragmented MP4 on stdout with `ffmpeg -c copy` (no re-encode, tiny CPU, no files). */
export async function openHls(url, { headers = {}, maxBytes } = {}) {
  const cap = maxBytes ?? await effectiveCapBytes();
  const { ffmpegPath } = await import('./ffmpeg-resolver.js');
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
  const h = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('');
  if (h) args.push('-headers', h);
  args.push('-i', url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  const proc = spawn(ffmpegPath || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
  counter.on('close', () => { try { proc.kill('SIGKILL'); } catch {} });
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
