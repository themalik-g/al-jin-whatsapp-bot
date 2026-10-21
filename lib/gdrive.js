// ─────────────────────────────────────────────
//  Al-Jin · lib/gdrive.js
//  Google Drive downloads WITHOUT an API key — for files / Docs / Sheets / Slides that are shared
//  as "anyone with the link".
//    parseDriveUrl(text)            → { kind, id } | null     (file, doc, sheet, slide, drawing, folder, form)
//    openDriveDownload(ref, fmt)    → { res, name, size, mime } (handles Google's "can't scan for viruses" page)
//    saveResponse(res, dest, opts)  → streams the body to a file (size cap, idle timeout, progress)
//    listDriveFolder(id)            → [{ id, name, isFolder }]  (public folders)
//  Throws Errors with a readable message (private file, quota exceeded, not found, too big …).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ID = '[A-Za-z0-9_-]{10,}';

// ── links ─────────────────────────────────────
export function parseDriveUrl(input) {
  const s = String(input || '').trim();
  let m;
  if ((m = new RegExp(`docs\\.google\\.com/document/(?:u/\\d+/)?d/(${ID})`, 'i').exec(s))) return { kind: 'doc', id: m[1] };
  if ((m = new RegExp(`docs\\.google\\.com/spreadsheets/(?:u/\\d+/)?d/(${ID})`, 'i').exec(s))) return { kind: 'sheet', id: m[1] };
  if ((m = new RegExp(`docs\\.google\\.com/presentation/(?:u/\\d+/)?d/(${ID})`, 'i').exec(s))) return { kind: 'slide', id: m[1] };
  if ((m = new RegExp(`docs\\.google\\.com/drawings/(?:u/\\d+/)?d/(${ID})`, 'i').exec(s))) return { kind: 'drawing', id: m[1] };
  if (/docs\.google\.com\/forms\//i.test(s)) return { kind: 'form', id: '' };
  if ((m = new RegExp(`drive\\.google\\.com/(?:drive/)?(?:u/\\d+/)?folders/(${ID})`, 'i').exec(s))) return { kind: 'folder', id: m[1] };
  if ((m = new RegExp(`drive\\.google\\.com/(?:u/\\d+/)?(?:folderview|embeddedfolderview)\\?[^\\s]*?id=(${ID})`, 'i').exec(s))) return { kind: 'folder', id: m[1] };
  if ((m = new RegExp(`drive\\.google\\.com/(?:u/\\d+/)?file/d/(${ID})`, 'i').exec(s))) return { kind: 'file', id: m[1] };
  if ((m = new RegExp(`(?:drive\\.google\\.com|drive\\.usercontent\\.google\\.com)/[^\\s]*?[?&]id=(${ID})`, 'i').exec(s))) return { kind: 'file', id: m[1] };
  if (new RegExp(`^${ID}$`).test(s) && s.length >= 25) return { kind: 'file', id: s };   // a bare file id
  return null;
}

export const findDriveLink = (text) => {
  for (const tok of String(text || '').split(/\s+/)) { const r = parseDriveUrl(tok); if (r) return { ...r, token: tok }; }
  return null;
};

// ── helpers ───────────────────────────────────
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");

export function filenameFromHeaders(headers) {
  const cd = (headers.get ? headers.get('content-disposition') : headers['content-disposition']) || '';
  let m = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(cd);
  if (m) { try { return decodeURIComponent(m[1].trim().replace(/^"|"$/g, '')); } catch { /* fall through */ } }
  m = /filename\s*=\s*"([^"]+)"/i.exec(cd) || /filename\s*=\s*([^;]+)/i.exec(cd);
  return m ? m[1].trim() : '';
}

const safeName = (n) => String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

const MIME = {
  mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  apk: 'application/vnd.android.package-archive', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const mimeOf = (name, headerMime) => {
  const ext = path.extname(String(name || '')).slice(1).toLowerCase();
  const hm = String(headerMime || '').split(';')[0].trim().toLowerCase();
  if (MIME[ext]) return MIME[ext];
  return hm && hm !== 'application/octet-stream' ? hm : 'application/octet-stream';
};
export const kindOf = (mime) => (/^image\//.test(mime) ? 'image' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'document');

async function get(url, headers = {}) {
  return fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers } });
}

// Reads an HTML reply (capped) so its message / form can be inspected.
async function readHtml(res, cap = 2 * 1024 * 1024) {
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, cap).toString('utf8');
}

function explainHtml(html, finalUrl = '') {
  if (/accounts\.google\.com/i.test(finalUrl) || /ServiceLogin|Sign in to continue/i.test(html)) return 'this file is private — ask the owner to share it as "Anyone with the link"';
  if (/Too many users have viewed or downloaded this file recently|download quota|quota for this file/i.test(html)) return 'Google Drive download quota exceeded for this file — try again later (or make a copy into your own Drive)';
  if (/You need access|Request access|need permission/i.test(html)) return 'this file is private — ask the owner to share it as "Anyone with the link"';
  if (/file you have requested does not exist|Not Found|404\. That.s an error|no longer exists/i.test(html)) return 'file not found — the link may be wrong or the file was deleted';
  return '';
}

// "Google Drive can't scan this file for viruses" page → the real download link is in a form.
function formDownloadUrl(html) {
  const f = /<form[^>]*id="download-form"[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i.exec(html);
  if (!f) {
    const a = /href="(\/uc\?export=download[^"]+)"/i.exec(html);                  // older page: a plain link
    return a ? `https://drive.google.com${decode(a[1])}` : '';
  }
  const params = new URLSearchParams();
  for (const m of f[2].matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const name = /name="([^"]*)"/i.exec(m[0])?.[1];
    const value = /value="([^"]*)"/i.exec(m[0])?.[1];
    if (name) params.set(name, decode(value || ''));
  }
  return `${decode(f[1])}?${params.toString()}`;
}

const isHtml = (res) => /text\/html/i.test(res.headers.get('content-type') || '');

function exportUrl(ref, format) {
  const f = String(format || '').toLowerCase().replace(/^\./, '');
  switch (ref.kind) {
    case 'doc': return { url: `https://docs.google.com/document/d/${ref.id}/export?format=${f || 'pdf'}`, ext: f || 'pdf' };
    case 'sheet': return { url: `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=${f || 'xlsx'}`, ext: f || 'xlsx' };
    case 'slide': return { url: `https://docs.google.com/presentation/d/${ref.id}/export/${f || 'pptx'}`, ext: f || 'pptx' };
    case 'drawing': return { url: `https://docs.google.com/drawings/d/${ref.id}/export/${f || 'png'}`, ext: f || 'png' };
    default: return null;
  }
}

/**
 * Opens the download. Returns { res, name, size, mime } — the body of `res` is the file.
 * `format` only matters for Docs / Sheets / Slides (pdf, docx, xlsx, csv, pptx, txt, png …).
 */
export async function openDriveDownload(ref, format = '') {
  if (!ref?.id) throw new Error('that is not a Google Drive file link');
  if (ref.kind === 'folder') throw new Error('that is a folder — use .gd on a file inside it');
  if (ref.kind === 'form') throw new Error('Google Forms cannot be downloaded');

  const ex = exportUrl(ref, format);
  let url = ex ? ex.url : `https://drive.usercontent.google.com/download?id=${ref.id}&export=download&confirm=t`;
  let res = null;
  for (let hop = 0; hop < 3; hop++) {
    res = await get(url);
    if (res.status === 404) throw new Error('file not found — the link may be wrong or the file was deleted');
    if (res.status === 403 || res.status === 401) {
      const why = explainHtml(isHtml(res) ? await readHtml(res) : '', res.url);
      throw new Error(why || 'access denied — the file must be shared as "Anyone with the link"');
    }
    if (!res.ok) throw new Error(`Google Drive answered HTTP ${res.status}`);
    if (!isHtml(res)) break;                                        // it is the file
    const html = await readHtml(res);
    const why = explainHtml(html, res.url);
    const next = formDownloadUrl(html);
    if (next && hop < 2) { url = next; continue; }                  // the virus-scan warning → follow its real link
    throw new Error(why || 'Google Drive returned a web page instead of the file (is the link shared with "Anyone with the link"?)');
  }
  if (isHtml(res)) throw new Error('Google Drive returned a web page instead of the file');

  const headerName = filenameFromHeaders(res.headers);
  const name = safeName(headerName) || `drive_${ref.id}${ex ? `.${ex.ext}` : ''}`;
  const size = Number(res.headers.get('content-length')) || 0;
  return { res, name, size, mime: mimeOf(name, res.headers.get('content-type')) };
}

/** Streams the body to `dest`. Aborts over `maxBytes` or after `idleMs` without data. Returns the byte count. */
export async function saveResponse(res, dest, { maxBytes = Infinity, total = 0, onProgress, idleMs = 60_000 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let seen = 0; let idle = null;
  const ctrl = new AbortController();
  const arm = () => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort(new Error('download stalled (no data for 60 s)')), idleMs); };
  arm();
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length; arm();
      if (seen > maxBytes) return cb(new Error('file is bigger than the download cap'));
      if (onProgress && total) { try { onProgress(Math.min(100, Math.floor((seen / total) * 100))); } catch {} }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest), { signal: ctrl.signal });
  } catch (e) {
    try { fs.unlinkSync(dest); } catch {}
    throw ctrl.signal.aborted ? (ctrl.signal.reason || e) : e;
  } finally { clearTimeout(idle); }
  return seen;
}

/** Files (and sub-folders) of a PUBLIC folder. */
export async function listDriveFolder(id, limit = 40) {
  const res = await get(`https://drive.google.com/embeddedfolderview?id=${id}#list`);
  if (!res.ok) throw new Error(`could not open the folder (HTTP ${res.status})`);
  const html = await readHtml(res);
  const out = [];
  const parts = html.split(/<div class="flip-entry"/i).slice(1);
  for (const p of parts) {
    const eid = /id="entry-([\w-]+)"/i.exec(p)?.[1];
    const title = /class="flip-entry-title">([^<]*)</i.exec(p)?.[1];
    if (!eid || !title) continue;
    out.push({ id: eid, name: decode(title).trim(), isFolder: /\/drive\/folders\//i.test(p) });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error(explainHtml(html, res.url) || 'the folder is empty or private');
  return out;
}
