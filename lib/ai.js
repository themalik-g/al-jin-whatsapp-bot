// ─────────────────────────────────────────────
// Al-Jin · lib/ai.js
// Dependency-free AI clients with an automatic FALLBACK CHAIN.
//
//   aiChat(messages)  tries, in order, every provider that is available:
//     1. Kilo         keyless free gateway   (200 req/h PER SERVER IP — shared panels hit this fast)
//     2. Pollinations keyless text endpoint  (best effort; POLLINATIONS_API_KEY optional)
//     3. Gemini       GEMINI_API_KEY         (free key: aistudio.google.com/apikey)
//     4. Groq         GROQ_API_KEY           (free key: console.groq.com)
//     5. OpenRouter   OPENROUTER_API_KEY     (free ":free" models)
//     6. Puter        PUTER_TOKEN
//
// A provider that is rate-limited is skipped for a while, so the next call is instant.
// Keys can be set from WhatsApp:  .setvar GEMINI_API_KEY <key>   (or in keys.env)
// Plain fetch, no SDKs, no local server → minimal RAM.
// ─────────────────────────────────────────────
import { getKey } from '../core/keys.js';
import { getSetting } from '../core/settings.js';
import { getVar } from '../core/vars.js';

const KILO_BASE = 'https://api.kilo.ai/api/gateway';
const PUTER_BASE = 'https://api.puter.com/puterai/openai/v1';
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'];
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// Preferred Kilo models (best-first). Anything else free is appended ranked by context length.
const KILO_PREFERRED = [
  'minimax/minimax-m2.5:free',
  'z-ai/glm-5:free',
  'arcee-ai/trinity-large-preview:free',
  'minimax/minimax-m2.1:free',
  'corethink:free',
];

/** Key lookup: `.setvar` value first, then environment / keys.env. Never throws. */
export function aiKey(name) {
  try { return getVar(name) || getKey(name) || null; } catch { return getKey(name) || null; }
}

async function jfetch(url, { method = 'GET', headers = {}, body, timeout = 60000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, {
      method, signal: ac.signal,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text.slice(0, 160) || `HTTP ${res.status}`;
      const err = new Error(res.status === 429 ? 'Rate limit reached — try again in a bit' : msg);
      err.status = res.status; throw err;
    }
    return json ?? { raw: text };
  } catch (e) {
    if (e?.name === 'AbortError') { const t = new Error('request timed out'); t.status = 408; throw t; }
    throw e;
  } finally { clearTimeout(timer); }
}

const textOf = (j) => {
  const raw = j?.choices?.[0]?.message?.content;
  return String(Array.isArray(raw) ? raw.map((p) => p?.text || '').join('') : raw || '').trim();
};

// ── Kilo ────────────────────────────────────────────────────────────────
let kiloWindow = { start: Date.now(), n: 0 };
let kiloBlockedUntil = 0;

function kiloBudget() {
  if (Date.now() - kiloWindow.start > 3600_000) kiloWindow = { start: Date.now(), n: 0 };
  if (kiloWindow.n >= 190) throw new Error('Kilo free quota for this hour is used up (200/h per IP).');
  kiloWindow.n++;
}

let kiloCache = { at: 0, ids: [] };
export async function kiloFreeModels() {
  if (Date.now() - kiloCache.at < 30 * 60_000 && kiloCache.ids.length) return kiloCache.ids;
  let ids = [];
  try {
    const j = await jfetch(`${KILO_BASE}/models`, { timeout: 12000 });
    const list = (j?.data || j?.models || []).filter((m) => typeof m?.id === 'string' && m.id.endsWith(':free'));
    const rank = (id) => { const i = KILO_PREFERRED.indexOf(id); return i === -1 ? 999 : i; };
    list.sort((a, b) => rank(a.id) - rank(b.id) || (b.context_length || 0) - (a.context_length || 0));
    ids = list.map((m) => m.id);
  } catch {}
  if (!ids.length) ids = [...KILO_PREFERRED];
  kiloCache = { at: Date.now(), ids };
  return ids;
}

export async function kiloChat(messages, modelIndex = 0, { maxTokens = 900 } = {}) {
  const ids = await kiloFreeModels();
  const model = ids[Math.min(modelIndex, ids.length - 1)];
  kiloBudget();
  let j;
  try {
    j = await jfetch(`${KILO_BASE}/chat/completions`, {
      method: 'POST', timeout: 70000,
      body: { model, messages, max_tokens: maxTokens, stream: false },
    });
  } catch (e) {
    // The limit is per IP, not per model → trying another Kilo model would not help.
    if (e.status === 429) kiloBlockedUntil = Date.now() + 10 * 60_000;
    throw e;
  }
  const text = textOf(j);
  if (!text) throw new Error('Empty reply from model');
  return { text, model };
}

// ── Puter ───────────────────────────────────────────────────────────────
export const puterConfigured = () => !!getKey('PUTER_TOKEN');
const puterHeaders = () => ({ Authorization: `Bearer ${getKey('PUTER_TOKEN')}` });

let puterCache = { at: 0, ids: [] };
export async function puterModels() {
  if (Date.now() - puterCache.at < 60 * 60_000 && puterCache.ids.length) return puterCache.ids;
  try {
    const j = await jfetch(`${PUTER_BASE}/models`, { headers: puterHeaders(), timeout: 15000 });
    const ids = (j?.data || j?.models || []).map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
    if (ids.length) puterCache = { at: Date.now(), ids };
  } catch {}
  return puterCache.ids;
}

export const PUTER_FAMILIES = {
  gpt:      { re: /(^|\/)gpt-/i,        fallback: 'gpt-4o-mini' },
  claude:   { re: /claude/i,            fallback: 'claude-sonnet-4' },
  grok:     { re: /grok/i,              fallback: 'grok-3-mini' },
  deepseek: { re: /deepseek/i,          fallback: 'deepseek-chat' },
  kimi:     { re: /kimi|moonshot/i,     fallback: 'kimi-k2' },
};

const natDesc = (a, b) => b.localeCompare(a, undefined, { numeric: true });

export async function resolvePuterModel(family) {
  const fam = PUTER_FAMILIES[family];
  const pinned = getSetting(`puter_model_${family}`) || getKey(`PUTER_MODEL_${family.toUpperCase()}`);
  if (pinned) return pinned;
  const ids = (await puterModels()).filter((id) => fam.re.test(id) && !/(embed|image|tts|whisper|moderation|audio|realtime|preview)/i.test(id));
  if (ids.length) return ids.sort(natDesc)[0];
  return fam.fallback;
}

export async function puterChat(model, messages, { maxTokens = 900 } = {}) {
  if (!puterConfigured()) throw new Error('PUTER_TOKEN is not set in keys.env (free at puter.com → dashboard → copy auth token).');
  const j = await jfetch(`${PUTER_BASE}/chat/completions`, {
    method: 'POST', headers: puterHeaders(), timeout: 90000,
    body: { model, messages, max_tokens: maxTokens, stream: false },
  });
  const text = textOf(j);
  if (!text) throw new Error('Empty reply from model');
  return { text, model };
}

// ── other providers (all small, all optional) ───────────────────────────
async function pollinationsChat(messages, { maxTokens }) {
  const key = aiKey('POLLINATIONS_API_KEY');
  const targets = [];
  if (key) targets.push({ url: 'https://gen.pollinations.ai/v1/chat/completions', headers: { Authorization: `Bearer ${key}` } });
  targets.push({ url: 'https://text.pollinations.ai/openai', headers: {} });          // legacy keyless endpoint
  let last;
  for (const t of targets) {
    try {
      const j = await jfetch(t.url, { method: 'POST', headers: t.headers, timeout: 25000, body: { model: 'openai', messages, max_tokens: maxTokens, stream: false } });
      const text = textOf(j);
      if (text) return { text, model: 'pollinations/openai' };
      last = new Error('empty reply');
    } catch (e) { last = e; }
  }
  throw last || new Error('Pollinations unavailable');
}

async function geminiChat(messages, { maxTokens }) {
  const apiKey = aiKey('GEMINI_API_KEY');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages.filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let last;
  for (const model of GEMINI_MODELS) {
    try {
      const j = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': apiKey }, timeout: 45000, body,
      });
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (text) return { text, model: `gemini/${model}` };
      last = new Error(j?.promptFeedback?.blockReason || 'empty reply');
    } catch (e) {
      last = e;
      if (e.status === 429 || e.status === 401 || e.status === 403) break;     // quota / bad key: other models share it
    }
  }
  throw last || new Error('Gemini unavailable');
}

async function groqChat(messages, { maxTokens }) {
  const apiKey = aiKey('GROQ_API_KEY');
  const models = [aiKey('GROQ_MODEL'), ...GROQ_MODELS].filter(Boolean);
  let last;
  for (const model of models) {
    try {
      const j = await jfetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 45000,
        body: { model, messages, max_tokens: maxTokens, stream: false },
      });
      const text = textOf(j);
      if (text) return { text, model: `groq/${model}` };
      last = new Error('empty reply');
    } catch (e) { last = e; if (e.status === 429 || e.status === 401) break; }
  }
  throw last || new Error('Groq unavailable');
}

let orCache = { at: 0, ids: [] };
async function openrouterFreeModels() {
  if (Date.now() - orCache.at < 30 * 60_000 && orCache.ids.length) return orCache.ids;
  const j = await jfetch(`${OPENROUTER_BASE}/models`, { timeout: 12000 });
  const ids = (j?.data || []).filter((m) => typeof m?.id === 'string' && m.id.endsWith(':free'))
    .sort((a, b) => (b.context_length || 0) - (a.context_length || 0)).map((m) => m.id);
  if (ids.length) orCache = { at: Date.now(), ids };
  return orCache.ids;
}

async function openrouterChat(messages, { maxTokens }) {
  const apiKey = aiKey('OPENROUTER_API_KEY');
  const pinned = aiKey('OPENROUTER_MODEL');
  const ids = pinned ? [pinned] : (await openrouterFreeModels()).slice(0, 3);
  let last;
  for (const model of ids) {
    try {
      const j = await jfetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000,
        body: { model, messages, max_tokens: maxTokens, stream: false },
      });
      const text = textOf(j);
      if (text) return { text, model: `openrouter/${model.replace(':free', '')}` };
      last = new Error('empty reply');
    } catch (e) { last = e; if (e.status === 401) break; }
  }
  throw last || new Error('OpenRouter unavailable');
}

// ── the chain ───────────────────────────────────────────────────────────
const cooldowns = new Map();          // provider id → timestamp until which it is skipped
const cool = (id, ms) => cooldowns.set(id, Date.now() + ms);
const isCool = (id) => (cooldowns.get(id) || 0) > Date.now();

const PROVIDERS = [
  { id: 'kilo', label: 'Kilo', ready: () => Date.now() > kiloBlockedUntil,
    run: (m, o) => kiloChat(m, o.index, o).then((r) => ({ ...r, model: r.model.replace(':free', '') })) },
  { id: 'pollinations', label: 'Pollinations', ready: () => true, run: pollinationsChat },
  { id: 'gemini', label: 'Gemini', ready: () => !!aiKey('GEMINI_API_KEY'), run: geminiChat },
  { id: 'groq', label: 'Groq', ready: () => !!aiKey('GROQ_API_KEY'), run: groqChat },
  { id: 'openrouter', label: 'OpenRouter', ready: () => !!aiKey('OPENROUTER_API_KEY'), run: openrouterChat },
  { id: 'puter', label: 'Puter', ready: () => puterConfigured(),
    run: async (m, o) => { const model = await resolvePuterModel('gpt'); return puterChat(model, m, o); } },
];

/**
 * Ask the first working provider. Returns { text, model, provider }.
 * Never returns partial garbage; throws ONE readable error if every provider failed.
 */
export async function aiChat(messages, { index = 0, maxTokens = 900 } = {}) {
  const notes = [];
  for (const p of PROVIDERS) {
    if (!p.ready()) continue;
    if (isCool(p.id)) { notes.push(`${p.label}: cooling down`); continue; }
    try {
      const r = await p.run(messages, { index, maxTokens });
      if (r?.text) return { text: r.text, model: r.model, provider: p.id };
      notes.push(`${p.label}: empty reply`);
    } catch (e) {
      const why = e.status === 429 ? 'rate-limited' : e.status === 401 || e.status === 403 ? 'key rejected' : e.status ? `HTTP ${e.status}` : (e.message || 'failed').slice(0, 60);
      notes.push(`${p.label}: ${why}`);
      cool(p.id, e.status === 429 ? 10 * 60_000 : e.status === 401 || e.status === 403 ? 60 * 60_000 : 60_000);
    }
  }
  const hasKey = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'].some((k) => aiKey(k));
  const err = new Error(
    `All AI providers are busy right now (${notes.join(' · ') || 'none available'}).` +
    (hasKey ? '\nTry again in a few minutes.'
      : '\nThe free keyless tier is shared per server IP. Quick fix (free): get a key at aistudio.google.com/apikey and send:\n`.setvar GEMINI_API_KEY <key>`'));
  err.notes = notes;
  throw err;
}

/** Which providers are currently usable (for a status command / debugging). */
export function aiStatus() {
  return PROVIDERS.map((p) => ({ id: p.id, ready: p.ready(), cooling: isCool(p.id) }));
}

/** Test helper: forget all cooldowns. */
export function _resetAiState() { cooldowns.clear(); kiloBlockedUntil = 0; kiloWindow = { start: Date.now(), n: 0 }; kiloCache = { at: 0, ids: [] }; orCache = { at: 0, ids: [] }; }
