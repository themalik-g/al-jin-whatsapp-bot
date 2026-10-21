// ─────────────────────────────────────────────
//  Al-Jin · lib/filehost.js
//  Uploads a file (from disk, streamed — never loaded into RAM) to a free anonymous file host and returns a link.
//  The host is chosen by file size so the file stays online as long as possible:
//
//    host         max size           kept for                                  (limits as published, autumn 2026)
//    Catbox       200 MB             forever (no expiry)
//    0x0.st       512 MB             30 days … 1 year (the smaller the file, the longer)
//    Buzzheavier  no published cap   ≈ 15–45 days (longer while it keeps being downloaded)
//    Gofile       no published cap   10 days after the last download
//    Litterbox    1 GB               72 hours max   (last resort for 512 MB–1 GB)
//
//    ≤ 200 MB  → Catbox, then 0x0.st, Buzzheavier, Gofile
//    ≤ 512 MB  → 0x0.st, then Buzzheavier, Gofile
//    bigger    → Buzzheavier, then Gofile (and Litterbox if ≤ 1 GB)
//  A host that fails (down, refuses the file type) simply hands over to the next one.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

const MB = 1024 * 1024;
const UA = 'Al-Jin-WhatsApp-Bot/1.0 (file upload command)';

// Endpoints are plain strings so they can be changed (tests, mirrors).
export const ENDPOINTS = {
  catbox: 'https://catbox.moe/user/api.php',
  zerox0: 'https://0x0.st',
  buzzheavier: 'https://w.buzzheavier.com',
  buzzheavierLink: 'https://buzzheavier.com',
  gofileGlobal: 'https://upload.gofile.io/uploadfile',
  gofileServers: 'https://api.gofile.io/servers',
  litterbox: 'https://litterbox.catbox.moe/resources/internals/api.php',
};

const clean = (n) => String(n || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'file';
const mbText = (b) => (b >= 1024 * MB ? `${(b / (1024 * MB)).toFixed(1)} GB` : `${(b / MB).toFixed(1)} MB`);

// ── low-level: a streamed request with a known Content-Length, upload progress and an idle timeout ──
function sendRequest({ url, method = 'POST', headers = {}, parts = [], contentLength, onProgress, idleMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    let sent = 0; let done = false;
    const req = lib.request({
      method, hostname: u.hostname, port: u.port || undefined, path: `${u.pathname}${u.search}`,
      headers: { 'User-Agent': UA, 'Content-Length': contentLength, ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { done = true; resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers }); });
      res.on('error', reject);
    });
    req.setTimeout(idleMs, () => req.destroy(new Error('upload stalled (no progress for 2 min)')));
    req.on('error', (e) => { if (!done) reject(e); });
    const body = Readable.from((async function* () { for (const p of parts) { for await (const c of (p instanceof Readable ? p : Readable.from([p]))) yield c; } })());
    body.on('data', (c) => { sent += c.length; if (onProgress && contentLength) { try { onProgress(Math.min(100, Math.floor((sent / contentLength) * 100))); } catch {} } });
    body.on('error', (e) => req.destroy(e));
    body.pipe(req);
  });
}

// multipart/form-data with the file as a stream
function multipart({ fields = {}, fileField, file, name, mime, size }) {
  const boundary = `----AlJin${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  let head = '';
  for (const [k, v] of Object.entries(fields)) head += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  head += `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${name}"\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const headBuf = Buffer.from(head, 'utf8'); const tailBuf = Buffer.from(tail, 'utf8');
  return {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    contentLength: headBuf.length + size + tailBuf.length,
    parts: [headBuf, fs.createReadStream(file), tailBuf],
  };
}

const okUrl = (t) => { const m = /https?:\/\/[^\s"'<>]+/.exec(String(t || '')); return m ? m[0] : ''; };

// ── the hosts ──────────────────────────────────
export const HOSTS = {
  catbox: {
    name: 'Catbox', maxBytes: 200 * MB,
    retention: () => 'never expires (permanent)',
    async upload(f) {
      const mp = multipart({ fields: { reqtype: 'fileupload', userhash: '' }, fileField: 'fileToUpload', ...f });
      const r = await sendRequest({ url: ENDPOINTS.catbox, headers: mp.headers, parts: mp.parts, contentLength: mp.contentLength, onProgress: f.onProgress });
      const url = okUrl(r.text);
      if (r.status >= 400 || !url) throw new Error(`Catbox: ${r.text.trim().slice(0, 100) || `HTTP ${r.status}`}`);
      return url;
    },
  },
  zerox0: {
    name: '0x0.st', maxBytes: 512 * MB,
    retention: (size) => {                                   // 0x0.st: 30 days + (30 − 365 days) · (size/512 MB − 1)³
      const days = Math.round(Math.min(365, Math.max(30, 30 + (30 - 365) * Math.pow(size / (512 * MB) - 1, 3))));
      return `about ${days} days`;
    },
    async upload(f) {
      const mp = multipart({ fileField: 'file', ...f });
      const r = await sendRequest({ url: ENDPOINTS.zerox0, headers: mp.headers, parts: mp.parts, contentLength: mp.contentLength, onProgress: f.onProgress });
      const url = okUrl(r.text);
      if (r.status >= 400 || !url) throw new Error(`0x0.st: ${r.text.trim().slice(0, 100) || `HTTP ${r.status}`}`);
      return url;
    },
  },
  buzzheavier: {
    name: 'Buzzheavier', maxBytes: Infinity,
    retention: () => 'about 15–45 days (longer while people keep downloading it)',
    async upload(f) {
      const r = await sendRequest({
        url: `${ENDPOINTS.buzzheavier}/${encodeURIComponent(f.name)}`, method: 'PUT',
        headers: { 'Content-Type': f.mime || 'application/octet-stream' },
        parts: [fs.createReadStream(f.file)], contentLength: f.size, onProgress: f.onProgress,
      });
      let id = '';
      try { const j = JSON.parse(r.text); id = j?.data?.id || j?.id || ''; } catch {}
      if (r.status >= 400 || !id) throw new Error(`Buzzheavier: ${r.text.trim().slice(0, 100) || `HTTP ${r.status}`}`);
      return `${ENDPOINTS.buzzheavierLink}/${id}`;
    },
  },
  gofile: {
    name: 'Gofile', maxBytes: Infinity,
    retention: () => '10 days after the last download (keep it alive by downloading it)',
    async upload(f) {
      const urls = [ENDPOINTS.gofileGlobal];
      try {                                                    // fall back to a specific server if the global endpoint is unavailable
        const s = await sendRequest({ url: ENDPOINTS.gofileServers, method: 'GET', contentLength: 0, parts: [] });
        const name = JSON.parse(s.text)?.data?.servers?.[0]?.name;
        if (name) urls.push(`https://${name}.gofile.io/contents/uploadfile`);
      } catch { /* use the global endpoint only */ }
      let lastErr = null;
      for (const url of urls) {
        try {
          const mp = multipart({ fileField: 'file', ...f });
          const r = await sendRequest({ url, headers: mp.headers, parts: mp.parts, contentLength: mp.contentLength, onProgress: f.onProgress });
          let link = '';
          try { const j = JSON.parse(r.text); link = j?.data?.downloadPage || (j?.data?.code ? `https://gofile.io/d/${j.data.code}` : ''); } catch {}
          if (r.status < 400 && link) return link;
          lastErr = new Error(`Gofile: ${r.text.trim().slice(0, 100) || `HTTP ${r.status}`}`);
        } catch (e) { lastErr = new Error(`Gofile: ${e.message}`); }
      }
      throw lastErr || new Error('Gofile: no answer');
    },
  },
  litterbox: {
    name: 'Litterbox', maxBytes: 1024 * MB,
    retention: () => '72 hours',
    async upload(f) {
      const mp = multipart({ fields: { reqtype: 'fileupload', time: '72h' }, fileField: 'fileToUpload', ...f });
      const r = await sendRequest({ url: ENDPOINTS.litterbox, headers: mp.headers, parts: mp.parts, contentLength: mp.contentLength, onProgress: f.onProgress });
      const url = okUrl(r.text);
      if (r.status >= 400 || !url) throw new Error(`Litterbox: ${r.text.trim().slice(0, 100) || `HTTP ${r.status}`}`);
      return url;
    },
  },
};

export const HOST_ALIASES = { catbox: 'catbox', cat: 'catbox', '0x0': 'zerox0', '0x0.st': 'zerox0', x0: 'zerox0', buzz: 'buzzheavier', buzzheavier: 'buzzheavier', gofile: 'gofile', go: 'gofile', litter: 'litterbox', litterbox: 'litterbox' };

/** Which hosts to try, best first, for a file of this size. */
export function planFor(size) {
  if (size <= 200 * MB) return ['catbox', 'zerox0', 'buzzheavier', 'gofile'];
  if (size <= 512 * MB) return ['zerox0', 'buzzheavier', 'gofile'];
  return size <= 1024 * MB ? ['buzzheavier', 'gofile', 'litterbox'] : ['buzzheavier', 'gofile'];
}

/**
 * Uploads `file`. `force` = one host id to use only. Returns { url, host, hostId, retention, size, tried }.
 * Throws one Error listing every host's failure.
 */
export async function uploadFile(file, { name, mime, size, onProgress, onTry, force } = {}) {
  const fileSize = size || fs.statSync(file).size;
  const fname = clean(name || file.split(/[\\/]/).pop());
  const order = force ? [force] : planFor(fileSize);
  const errors = [];
  for (const id of order) {
    const h = HOSTS[id];
    if (!h) continue;
    if (fileSize > h.maxBytes) { errors.push(`${h.name}: file is over its ${mbText(h.maxBytes)} limit`); continue; }
    try {
      if (onTry) { try { onTry(h.name, errors.length); } catch {} }
      const url = await h.upload({ file, name: fname, mime, size: fileSize, onProgress });
      return { url, host: h.name, hostId: id, retention: h.retention(fileSize), size: fileSize, tried: errors };
    } catch (e) {
      errors.push(String(e?.message || e).split('\n')[0].slice(0, 140));
    }
  }
  const err = new Error(`no host accepted the file — ${errors.join(' | ')}`);
  err.errors = errors;
  throw err;
}

/** For `.upload info`. */
export function hostsTable() {
  return [
    ['Catbox', '200 MB', 'never expires'],
    ['0x0.st', '512 MB', '30 days – 1 year (smaller = longer)'],
    ['Buzzheavier', 'no cap', '≈ 15–45 days (longer if downloaded)'],
    ['Gofile', 'no cap', '10 days after last download'],
    ['Litterbox', '1 GB', '72 hours'],
  ];
}
