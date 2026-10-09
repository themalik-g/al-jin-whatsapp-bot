// ─────────────────────────────────────────────
//  Al-Jin · lib/stt.js
//  Speech-to-text with an automatic FALLBACK CHAIN — plain fetch, zero npm packages.
//
//    1. Groq       GROQ_API_KEY       whisper-large-v3 (most accurate) → whisper-large-v3-turbo as backup
//                                     override with GROQ_STT_MODEL   (free key: console.groq.com)
//    2. Gemini     GEMINI_API_KEY     gemini flash(-lite)      (free key: aistudio.google.com/apikey)
//    3. Deepgram   DEEPGRAM_API_KEY   nova-3                   (free credit: console.deepgram.com)
//    4. OpenAI     OPENAI_API_KEY     whisper-1                (paid, last resort)
//
//  Keys are read like every other Al-Jin key:  .setvar GROQ_API_KEY <key>   or keys.env
//  A provider with no key is skipped; a rate-limited one is parked for a while.
//  Every provider returns the same shape:  [{ start, end, text }]  (seconds).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import { aiKey } from './ai.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite'];   // most accurate first
const REQUEST_TIMEOUT_MS = 180_000;

/** Largest audio file (bytes) a single request may carry — Groq's free tier caps at 25 MB. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

class SttError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

async function http(url, { method = 'POST', headers = {}, body, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body, signal: ac.signal });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = json?.error?.message || json?.err_msg || json?.message || text.slice(0, 160) || `HTTP ${res.status}`;
      throw new SttError(msg, res.status);
    }
    return json ?? {};
  } catch (e) {
    if (e?.name === 'AbortError') throw new SttError('request timed out', 408);
    throw e;
  } finally { clearTimeout(timer); }
}

// ── SRT text → segments (used for Gemini's answer) ───────────────────────
const toSec = (h, m, s, ms) => (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;

export function parseSrt(srt) {
  const out = [];
  const cleaned = String(srt || '').replace(/```[a-z]*\n?/gi, '').replace(/\r/g, '').trim();
  for (const block of cleaned.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d+):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/);
    if (!m) continue;
    const pad = (x) => x.padEnd(3, '0');
    const text = lines.slice(ti + 1).join(' ').trim();
    if (!text) continue;
    out.push({ start: toSec(m[1], m[2], m[3], pad(m[4])), end: toSec(m[5], m[6], m[7], pad(m[8])), text });
  }
  return out;
}

// ── providers ────────────────────────────────────────────────────────────
async function whisperCompatible(url, key, model, filePath, language) {
  const buf = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', language);
  const j = await http(url, { headers: { Authorization: `Bearer ${key}` }, body: form });
  let segs = (j.segments || []).map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').trim() }));
  if (!segs.length && j.text && j.duration) segs = [{ start: 0, end: j.duration, text: String(j.text).trim() }];
  segs.language = j.language || '';          // e.g. "urdu", "hindi", "english"
  return segs;
}

// Accuracy first: whisper-large-v3 is Groq's most accurate free speech model (turbo is faster but less exact,
// especially for Urdu/Hindi and noisy audio). Groq limits each model separately, so turbo is also a spare quota.
const groqModels = () => [...new Set([process.env.GROQ_STT_MODEL, 'whisper-large-v3', 'whisper-large-v3-turbo'].filter(Boolean))];

async function groq(filePath, { language }) {
  const key = aiKey('GROQ_API_KEY');
  if (!key) throw new SttError('GROQ_API_KEY not set', -1);
  let lastErr;
  for (const model of groqModels()) {
    try { return await whisperCompatible(GROQ_URL, key, model, filePath, language); }
    catch (e) {
      lastErr = e;
      if (e.status === 401 || e.status === 403 || e.status === 413) throw e;   // bad key / file too big: another model will not help
    }
  }
  throw lastErr;
}

async function openai(filePath, { language }) {
  const key = aiKey('OPENAI_API_KEY');
  if (!key) throw new SttError('OPENAI_API_KEY not set', -1);
  return whisperCompatible(OPENAI_URL, key, 'whisper-1', filePath, language);
}

async function gemini(filePath, { language }) {
  const key = aiKey('GEMINI_API_KEY');
  if (!key) throw new SttError('GEMINI_API_KEY not set', -1);
  const data = (await fs.promises.readFile(filePath)).toString('base64');
  const lang = language ? ` The spoken language is "${language}".` : '';
  const prompt = `Transcribe this audio with accurate timestamps.${lang} Keep the original spoken language; do not translate. `
    + 'Return ONLY a valid SRT file (index, "HH:MM:SS,mmm --> HH:MM:SS,mmm", text). Each cue must be at most 6 seconds and 2 short lines. '
    + 'No explanations and no markdown.';
  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      const j = await http(`${GEMINI_BASE}/${model}:generateContent`, {
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: 'audio/mp3', data } }, { text: prompt }] }],
          generationConfig: { temperature: 0 },
        }),
      });
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      const segs = parseSrt(text);
      if (segs.length) return segs;
      lastErr = new SttError('Gemini returned no usable subtitles', 502);
    } catch (e) {
      lastErr = e;
      if (e.status === 401 || e.status === 403) throw e;   // bad key: other models will fail too
    }
  }
  throw lastErr || new SttError('Gemini failed', 502);
}

async function deepgram(filePath, { language }) {
  const key = aiKey('DEEPGRAM_API_KEY');
  if (!key) throw new SttError('DEEPGRAM_API_KEY not set', -1);
  const buf = await fs.promises.readFile(filePath);
  const call = (qs) => http(`${DEEPGRAM_URL}?${qs}`, {
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/mpeg' }, body: buf,
  });
  const base = 'model=nova-3&smart_format=true&utterances=true&punctuate=true';
  let j;
  try {
    j = await call(language ? `${base}&language=${encodeURIComponent(language)}` : `${base}&detect_language=true`);
  } catch (e) {
    if (e.status !== 400) throw e;
    j = await call(`${base}&language=${encodeURIComponent(language || 'en')}`);   // detection not accepted → plain
  }
  const utt = j?.results?.utterances || [];
  const out = utt.map((u) => ({ start: u.start, end: u.end, text: String(u.transcript || '').trim() }));
  out.language = j?.results?.channels?.[0]?.detected_language || language || '';
  return out;
}

export const PROVIDERS = [
  { name: 'Groq', env: 'GROQ_API_KEY', run: groq },
  { name: 'Gemini', env: 'GEMINI_API_KEY', run: gemini },
  { name: 'Deepgram', env: 'DEEPGRAM_API_KEY', run: deepgram },
  { name: 'OpenAI', env: 'OPENAI_API_KEY', run: openai },
];

/** Providers that currently have a key. */
export const configuredProviders = () => PROVIDERS.filter((p) => !!aiKey(p.env));

// provider name → timestamp until which it is skipped (after 429 / quota errors)
const parkedUntil = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Transcribes one audio file, trying every configured provider in order.
 * Returns { segments, provider }. Throws an Error whose message lists why each provider failed.
 */
export async function transcribe(filePath, { language = '', providers = PROVIDERS, onProvider } = {}) {
  const usable = providers.filter((p) => aiKey(p.env));
  if (!usable.length) {
    throw new Error('No speech-to-text key set. Add a free one:  .setvar GROQ_API_KEY <key>  (console.groq.com)');
  }
  const problems = [];
  const now = Date.now();
  // providers parked by a recent rate limit go last instead of being dropped
  const ordered = [...usable.filter((p) => (parkedUntil.get(p.name) || 0) <= now), ...usable.filter((p) => (parkedUntil.get(p.name) || 0) > now)];

  for (const p of ordered) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        try { onProvider?.(p.name); } catch {}
        const raw = await p.run(filePath, { language });
        const detected = raw?.language || language || '';
        const segments = raw.filter((s) => s && s.text && Number.isFinite(s.start) && Number.isFinite(s.end));
        if (!segments.length) throw new SttError('no speech detected', 204);
        parkedUntil.delete(p.name);
        return { segments, provider: p.name, language: detected };
      } catch (e) {
        const st = e?.status || 0;
        if (st === 429 || /quota|rate/i.test(e?.message || '')) parkedUntil.set(p.name, Date.now() + 10 * 60_000);
        const retryable = (st === 429 || st >= 500 || st === 408 || st === 0) && attempt === 0 && st !== 204;
        if (retryable) { await sleep(st === 429 ? 2500 : 1200); continue; }
        problems.push(`${p.name}: ${st === 429 ? 'rate limit reached' : (e?.message || 'failed')}`);
        break;
      }
    }
  }
  throw new Error(`All speech-to-text providers failed — ${problems.join(' · ')}`);
}
