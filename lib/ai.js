// lib/ai.js — dependency-free AI clients (Kilo keyless gateway + Puter OpenAI-compatible).
// Plain fetch, no SDKs, no local server → minimal RAM.
import { getKey } from '../core/keys.js';
import { getSetting } from '../core/settings.js';

const KILO_BASE = 'https://api.kilo.ai/api/gateway';
const PUTER_BASE = 'https://api.puter.com/puterai/openai/v1';

// Preferred (best-first). Anything else free is appended ranked by context length.
const KILO_PREFERRED = [
  'minimax/minimax-m2.5:free',
  'z-ai/glm-5:free',
  'arcee-ai/trinity-large-preview:free',
  'minimax/minimax-m2.1:free',
  'corethink:free',
];

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
    return json;
  } finally { clearTimeout(timer); }
}

// ── hourly budget guard (Kilo anonymous = 200 req/h per IP) ─────────────
let kiloWindow = { start: Date.now(), n: 0 };
function kiloBudget() {
  if (Date.now() - kiloWindow.start > 3600_000) kiloWindow = { start: Date.now(), n: 0 };
  if (kiloWindow.n >= 190) throw new Error('Kilo free quota for this hour is used up (200/h per IP). Try later or use .gpt / .claude.');
  kiloWindow.n++;
}

// ── Kilo ────────────────────────────────────────────────────────────────
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
  const j = await jfetch(`${KILO_BASE}/chat/completions`, {
    method: 'POST', timeout: 70000,
    body: { model, messages, max_tokens: maxTokens, stream: false },
  });
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty reply from model');
  return { text: String(text).trim(), model };
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
  const raw = j?.choices?.[0]?.message?.content;
  const text = Array.isArray(raw) ? raw.map((p) => p?.text || '').join('') : raw;
  if (!text) throw new Error('Empty reply from model');
  return { text: String(text).trim(), model };
}
