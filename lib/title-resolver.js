// ─────────────────────────────────────────────
//  Al-Jin · lib/title-resolver.js
//  Keyword clean-up + optional AI (Groq → Gemini) to find the exact title the user means,
//  and a fuzzy ranker so the best match is listed first.
//  Works with NO key (keyword mode); keys only make it smarter. AI failure never blocks a search.
//    .setvar GROQ_API_KEY <key>     (console.groq.com — free)
//    .setvar GEMINI_API_KEY <key>   (aistudio.google.com/apikey — free)
// ─────────────────────────────────────────────
import { getVar } from '../core/vars.js';
import { getKey } from '../core/keys.js';

const key = (n) => getVar(n) || getKey(n) || null;
export const aiConfigured = () => !!(key('GROQ_API_KEY') || key('GEMINI_API_KEY'));

const NOISE = new Set(['download', 'downloads', 'full', 'movie', 'movies', 'film', 'hd', 'fhd', 'uhd', '4k', '1080p', '720p', '480p', '360p',
  'bluray', 'brrip', 'webrip', 'webdl', 'hdrip', 'dvdrip', 'camrip', 'hindi', 'urdu', 'english', 'dubbed', 'dual', 'audio', 'subtitle', 'subtitles',
  'subs', 'free', 'online', 'watch', 'torrent', 'mp4', 'mkv', 'x264', 'x265', 'hevc', 'series', 'season', 'episode']);
const ARTICLES = new Set(['the', 'a', 'an']);
const YEAR = /\b(19\d{2}|20\d{2})\b/;

const norm = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Raw user text → { words, year } with noise (quality tags, "download", "full movie"…) removed. */
export function parseQuery(raw) {
  let t = norm(raw);
  const year = (YEAR.exec(t) || [])[1] || '';
  if (year) t = t.replace(YEAR, ' ');
  let words = t.split(' ').filter(Boolean);
  const kept = words.filter((w) => !NOISE.has(w));
  if (kept.length) words = kept;
  return { words, year };
}

// ── fuzzy scoring ────────────────────────────
function lev1(a, b) { // true when edit distance ≤ 1
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
const tokMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev1(a, b));

/** 0..1 — how well a result title fits what was wanted. */
export function score(wantedWords, wantedYear, title, year = '') {
  const cand = parseQuery(title).words.filter((w) => !ARTICLES.has(w));
  const want = wantedWords.filter((w) => !ARTICLES.has(w));
  if (!want.length || !cand.length) return 0;
  const used = new Set(); let hit = 0;
  for (const w of want) {
    const i = cand.findIndex((c, k) => !used.has(k) && tokMatch(w, c));
    if (i >= 0) { used.add(i); hit++; }
  }
  let s = (hit / want.length) * 0.8 + (hit / cand.length) * 0.2;
  const cy = String(year || '') || (YEAR.exec(String(title)) || [])[1] || '';
  if (wantedYear && cy) s += cy === wantedYear ? 0.1 : -0.1;
  return Math.max(0, Math.min(1, s));
}

/** Sort results best-first; hide clear mismatches when something fits well. Keeps original order on ties. */
export function rankResults(results, wantedTitle, wantedYear = '') {
  const { words, year } = parseQuery(wantedTitle);
  const y = wantedYear || year;
  const scored = results.map((r, i) => ({ r, i, s: score(words, y, r.title, r.year) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const top = scored[0]?.s || 0;
  const keep = top >= 0.5 ? scored.filter((x) => x.s >= Math.max(0.4, top - 0.35)) : scored;
  return { results: keep.map((x) => x.r), top };
}

// ── search variants (keyword mode) ───────────
function variantsFrom(words) {
  const out = []; const add = (w) => { const s = w.join(' ').trim(); if (s && !out.includes(s)) out.push(s); };
  add(words);
  const noArt = words.filter((w) => !ARTICLES.has(w));
  add(noArt);                                            // "the great grand masti" → "great grand masti"
  if (noArt.length >= 3) add(noArt.slice(0, -1));        // typo / extra last word: "project hail marry" → "project hail"
  if (noArt.length >= 4) add(noArt.slice(0, 2));
  return out.slice(0, 4);
}

// ── AI ───────────────────────────────────────
const cache = new Map();
const PROMPT = (q, kind) => `A user of a WhatsApp ${kind} downloader typed: "${q}".
Fix spelling and return the exact official title and release year of the ${kind} they most likely mean.
Reply with ONLY compact JSON: {"title":"","year":"","alt":[]}  ("alt" = up to 2 other well-known titles/spellings, or []).
If you do not recognise it, return {"title":"","year":"","alt":[]}. Never invent.`;

async function post(url, body, headers = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
const parseJson = (txt) => { const m = /\{[\s\S]*\}/.exec(String(txt || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

async function viaGroq(q, kind) {
  const k = key('GROQ_API_KEY'); if (!k) return null;
  const j = await post('https://api.groq.com/openai/v1/chat/completions', {
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', temperature: 0, max_tokens: 120,
    response_format: { type: 'json_object' }, messages: [{ role: 'user', content: PROMPT(q, kind) }],
  }, { Authorization: `Bearer ${k}` });
  return parseJson(j?.choices?.[0]?.message?.content);
}
async function viaGemini(q, kind) {
  const k = key('GEMINI_API_KEY'); if (!k) return null;
  for (const model of [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'].filter(Boolean)) {
    try {
      const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`, {
        contents: [{ parts: [{ text: PROMPT(q, kind) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: 'application/json' },
      });
      const r = parseJson(j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(''));
      if (r) return r;
    } catch (e) { console.warn(`[title-resolver] gemini ${model}:`, e.message); }
  }
  return null;
}

async function askAI(q, kind) {
  const ck = `${kind}|${norm(q)}`;
  if (cache.has(ck)) return cache.get(ck);
  let r = null; let by = null;
  try { r = await viaGroq(q, kind); if (r) by = 'Groq'; } catch (e) { console.warn('[title-resolver] groq:', e.message); }
  if (!r?.title) { try { r = await viaGemini(q, kind); if (r) by = 'Gemini'; } catch (e) { console.warn('[title-resolver] gemini:', e.message); } }
  const title = String(r?.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const out = title ? {
    title, by,
    year: /^(19|20)\d{2}$/.test(String(r.year || '')) ? String(r.year) : '',
    alt: (Array.isArray(r.alt) ? r.alt : []).map((a) => String(a).trim().slice(0, 80)).filter(Boolean).slice(0, 2),
  } : null;
  cache.set(ck, out);
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return out;
}

/**
 * → { shown, wanted, year, variants[], by }
 *   shown    — the title to display ("Project Hail Mary" / cleaned user text)
 *   wanted   — the title the ranker compares against
 *   variants — search strings to try, best first
 */
export async function resolveQuery(raw, kind = 'movie') {
  const { words, year } = parseQuery(raw);
  const cleaned = words.join(' ');
  const base = variantsFrom(words);
  let ai = null;
  if (aiConfigured() && cleaned) { try { ai = await askAI(`${cleaned}${year ? ` ${year}` : ''}`, kind); } catch { /* keyword mode */ } }
  if (!ai) return { shown: cleaned, wanted: cleaned, year, variants: base, by: null };
  const aiVariants = [ai.title, ...ai.alt].map((t) => parseQuery(t).words.join(' ')).filter(Boolean);
  const variants = [...new Set([...aiVariants, ...base])].slice(0, 6);
  return { shown: ai.title, wanted: ai.title, year: ai.year || year, variants, by: ai.by };
}
