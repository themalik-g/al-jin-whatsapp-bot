// ─────────────────────────────────────────────
//  Al-Jin · lib/ia-movies.js
//  Free movie / TV source: the Internet Archive (public-domain & freely
//  licensed films and shows). No API key, no extra dependency.
//
//  Fallbacks (every step has an alternative, nothing here can crash the bot):
//    search   advancedsearch.php  →  services/search/v1/scrape
//             strict collection filter  →  loose title-only filter
//    files    /metadata/<id> (JSON)  →  /download/<id>/<id>_files.xml
//    download archive.org/download/…  →  the item's own storage server
//
//  Pure helpers (episodeNo, qualityBucket, groupEpisodes, autoPick …) are
//  exported so they can be unit-tested without network access.
// ─────────────────────────────────────────────
import { httpGetJson, httpGetText } from './net.js';

const IA = 'https://archive.org';
export const SOURCE_NAME = 'Internet Archive';

const VIDEO_EXT = /\.(mp4|m4v|mkv|avi|webm|ogv|mov)$/i;
const PLAYABLE_EXT = /\.(mp4|m4v)$/i;
const SKIP_NAME = /(trailer|sample|preview|promo|thumb|__ia_thumb)/i;
const MIN_VIDEO_BYTES = 5 * 1024 * 1024;
const RES_NUMBERS = new Set([240, 360, 480, 576, 720, 1080, 512]);

const one = (v) => (Array.isArray(v) ? v[0] : v);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const unesc = (s = '') => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export const cleanQuery = (q) =>
  String(q || '').normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// ── search ───────────────────────────────────
function lucene(query, kind, strict) {
  const words = cleanQuery(query).split(' ').filter(Boolean);
  if (!words.length) return null;
  const base = `title:(${words.join(' AND ')}) AND mediatype:(movies)`;
  if (!strict) return base;
  return kind === 'series'
    ? `${base} AND collection:(classic_tv OR television OR classic_cartoons)`
    : `${base} AND collection:(feature_films)`;
}

const normDoc = (d) => ({
  id: String(d.identifier),
  title: String(one(d.title) || d.identifier).slice(0, 120),
  year: String(one(d.year) || '').slice(0, 4),
  downloads: num(d.downloads),
});

async function viaAdvanced(q, rows) {
  const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=downloads`
    + `&sort[]=${encodeURIComponent('downloads desc')}&rows=${rows}&page=1&output=json`;
  const j = await httpGetJson(url, { timeout: 20000 });
  return (j?.response?.docs || []).filter((d) => d?.identifier).map(normDoc);
}

async function viaScrape(q, rows) {
  const url = `${IA}/services/search/v1/scrape?q=${encodeURIComponent(q)}&fields=identifier,title,year,downloads`
    + `&count=100&sorts=${encodeURIComponent('downloads desc')}`;
  const j = await httpGetJson(url, { timeout: 20000 });
  return (j?.items || []).filter((d) => d?.identifier).map(normDoc)
    .sort((a, b) => b.downloads - a.downloads).slice(0, rows);
}

/** Top `rows` titles for a query. kind: 'movie' | 'series'. Throws only if every endpoint failed. */
export async function searchTitles(query, kind = 'movie', rows = 5) {
  let lastErr = null; let answered = false;
  for (const strict of [true, false]) {
    const q = lucene(query, kind, strict);
    if (!q) return [];
    for (const fn of [viaAdvanced, viaScrape]) {
      try {
        const docs = await fn(q, rows);
        answered = true;
        if (docs.length) return docs;
      } catch (e) { lastErr = e; }
    }
  }
  if (!answered && lastErr) throw new Error(`search unavailable (${lastErr.message})`);
  return [];
}

// ── files ────────────────────────────────────
export function parseFilesXml(xml = '') {
  const out = []; const re = /<file\s+([^>]*)>([\s\S]*?)<\/file>/g; let m;
  while ((m = re.exec(xml))) {
    const name = /name="([^"]*)"/.exec(m[1])?.[1];
    if (!name) continue;
    const tag = (t) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[2])?.[1];
    out.push({ name: unesc(name), format: unesc(tag('format') || ''), size: tag('size'), height: tag('height') });
  }
  return out;
}

/** Item details + raw file list. Never returns an empty file list silently. */
export async function getItem(id) {
  let lastErr = null;
  try {
    const j = await httpGetJson(`${IA}/metadata/${encodeURIComponent(id)}`, { timeout: 25000 });
    if (Array.isArray(j?.files) && j.files.length) {
      return {
        id, title: String(one(j.metadata?.title) || id), year: String(one(j.metadata?.year) || '').slice(0, 4),
        files: j.files, server: j.d1 || j.server || '', dir: j.dir || '',
      };
    }
    lastErr = new Error('item has no files');
  } catch (e) { lastErr = e; }
  try {
    const xml = await httpGetText(`${IA}/download/${encodeURIComponent(id)}/${encodeURIComponent(id)}_files.xml`, { timeout: 25000 });
    const files = parseFilesXml(xml);
    if (files.length) return { id, title: id, year: '', files, server: '', dir: '' };
  } catch (e) { lastErr = e; }
  throw new Error(`could not read item (${lastErr?.message || 'unknown'})`);
}

/** Primary + fallback download URLs for one file. */
export function downloadUrls(item, file) {
  const enc = file.name.split('/').map(encodeURIComponent).join('/');
  const urls = [`${IA}/download/${encodeURIComponent(item.id)}/${enc}`];
  if (item.server && item.dir) urls.push(`https://${item.server}${item.dir}/${enc}`);
  return urls;
}

// ── quality ──────────────────────────────────
/** 360 / 480 / 720 / 1080 — or 0 when the height can't be told. */
export function qualityBucket(f) {
  let h = parseInt(f.height, 10) || 0;
  if (!h) { const m = /(\d{3,4})p/i.exec(f.name || ''); if (m) h = Number(m[1]); }
  if (!h) {
    const fmt = String(f.format || '');
    if (/1080/.test(fmt)) h = 1080;
    else if (/720|\bhd\b/i.test(fmt)) h = 720;
    else if (/512kb|h\.264 ia/i.test(fmt)) h = 360;
  }
  if (!h) return 0;
  return h >= 1000 ? 1080 : h >= 640 ? 720 : h >= 420 ? 480 : 360;
}

/** Playable video files of an item, normalised. mp4/m4v win over other containers. */
export function videoFiles(rawFiles = []) {
  const all = rawFiles
    .filter((f) => f?.name && VIDEO_EXT.test(f.name) && !SKIP_NAME.test(f.name))
    .map((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      return { name: f.name, ext, size: num(f.size), format: f.format || '', height: f.height, playable: PLAYABLE_EXT.test(f.name) };
    })
    .filter((f) => !f.size || f.size >= MIN_VIDEO_BYTES)
    .map((f) => ({ ...f, bucket: qualityBucket(f) }));
  const mp4 = all.filter((f) => f.playable);
  return mp4.length ? mp4 : all;
}

/** One entry per quality (largest file wins), lowest → highest. */
export function qualityOptions(files = []) {
  const by = new Map();
  for (const f of files) {
    const cur = by.get(f.bucket);
    if (!cur || f.size > cur.size) by.set(f.bucket, f);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0])
    .map(([bucket, file]) => ({ bucket, label: bucket ? `${bucket}p` : 'Standard', file }));
}

/** Highest quality that fits BOTH the size cap and the max height; null when nothing fits. */
export function autoPick(files = [], { maxBytes = Infinity, maxHeight = 2160 } = {}) {
  const fits = qualityOptions(files).filter(({ bucket, file }) =>
    (!file.size || file.size <= maxBytes) && (bucket || 480) <= maxHeight);
  return fits.length ? fits[fits.length - 1] : null;
}

// ── episodes ─────────────────────────────────
const stemOf = (name) => String(name).split('/').pop().replace(/\.[^.]+$/, '')
  .replace(/[\s._-]*(512kb|hd|\d{3,4}p)$/i, '');

/** Episode number from a file stem (S01E11, Ep 11, E11, or the last small number). 0 = unknown. */
export function episodeNo(stem) {
  const s = String(stem);
  let m = /s\d{1,2}[\s._-]*e(\d{1,3})/i.exec(s);
  if (m) return Number(m[1]);
  m = /(?:^|[^a-z])(?:ep(?:isode)?|e)[\s._-]*(\d{1,3})(?!\d)/i.exec(s);
  if (m) return Number(m[1]);
  const found = [...s.matchAll(/(\d+)(?![\dp])/g)]
    .map((x) => ({ n: Number(x[1]), len: x[1].length, after: s.slice(x.index + x[1].length, x.index + x[1].length + 2).toLowerCase() }))
    .filter((x) => x.len <= 3 && !RES_NUMBERS.has(x.n) && x.after !== 'kb' && x.n > 0);
  return found.length ? found[found.length - 1].n : 0;
}

/** Map<episodeNumber, files[]> sorted by episode. Files of one episode = its qualities. */
export function groupEpisodes(files = []) {
  const stems = new Map();
  for (const f of files) {
    const st = stemOf(f.name);
    if (!stems.has(st)) stems.set(st, []);
    stems.get(st).push(f);
  }
  const detected = [...stems.entries()].map(([st, fs]) => ({ st, fs, n: episodeNo(st) }));
  const anyDetected = detected.some((d) => d.n);
  const ordered = anyDetected ? detected : detected.sort((a, b) => a.st.localeCompare(b.st, undefined, { numeric: true }));
  const out = new Map(); let seq = 0;
  for (const d of ordered) {
    seq += 1;
    const n = anyDetected ? d.n : seq;
    if (!n) continue;
    out.set(n, [...(out.get(n) || []), ...d.fs]);
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}
