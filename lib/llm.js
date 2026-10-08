// ─────────────────────────────────────────────
//  Al-Jin · lib/llm.js
//  One chat helper for subtitles, .trt and .bot:  Groq (many free models) → Gemini → keyless free GPT.
//  Groq: the live model list is read from the API, each model has its own rate limit, so when one is
//  busy the next model is tried instantly. Plain fetch, no npm packages.
//    purpose 'fast'    → smallest/fastest models first (chat)
//    purpose 'quality' → biggest models first (translation)
// ─────────────────────────────────────────────
import { aiKey, aiChat } from './ai.js';

const GROQ = 'https://api.groq.com/openai/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const FAST = ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-120b', 'qwen/qwen3-32b', 'moonshotai/kimi-k2-instruct'];
const QUALITY = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'moonshotai/kimi-k2-instruct-0905', 'moonshotai/kimi-k2-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const SKIP = /whisper|guard|tts|playai|orpheus|compound|safeguard|embed|distil|allam/i;
const MAX_TRIES = 6;

const parked = new Map();                       // "provider:model" → until (ms)
const isParked = (k) => (parked.get(k) || 0) > Date.now();
const park = (k, sec) => parked.set(k, Date.now() + sec * 1000);
export const _resetLlm = () => { parked.clear(); cache = { at: 0, ids: [] }; };

async function call(url, { method = 'POST', headers = {}, body, timeout = 60000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: ac.signal });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const e = new Error(json?.error?.message || json?.message || text.slice(0, 140) || `HTTP ${res.status}`);
      e.status = res.status; e.retryAfter = Number(res.headers.get('retry-after')) || 0;
      throw e;
    }
    return json ?? {};
  } catch (e) {
    if (e?.name === 'AbortError') { const t = new Error('timed out'); t.status = 408; throw t; }
    throw e;
  } finally { clearTimeout(timer); }
}

const clean = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

let cache = { at: 0, ids: [] };
async function groqModels(key) {
  if (Date.now() - cache.at < 3600_000 && cache.ids.length) return cache.ids;
  try {
    const j = await call(`${GROQ}/models`, { method: 'GET', headers: { Authorization: `Bearer ${key}` }, timeout: 10000 });
    const ids = (j.data || []).filter((m) => m.active !== false && !SKIP.test(m.id)).map((m) => m.id);
    if (ids.length) cache = { at: Date.now(), ids };
    return ids;
  } catch { return cache.ids; }
}

export async function groqChat(messages, { purpose = 'fast', maxTokens = 1024, temperature = 0.3 } = {}) {
  const key = aiKey('GROQ_API_KEY');
  if (!key) throw Object.assign(new Error('GROQ_API_KEY not set'), { status: -1 });
  const live = await groqModels(key);
  const pref = purpose === 'quality' ? QUALITY : FAST;
  const order = live.length ? [...pref.filter((m) => live.includes(m)), ...live.filter((m) => !pref.includes(m))] : pref;
  const notes = [];
  let tries = 0;
  for (const model of order) {
    if (isParked(`groq:${model}`)) continue;
    if (tries++ >= MAX_TRIES) break;
    try {
      const j = await call(`${GROQ}/chat/completions`, { headers: { Authorization: `Bearer ${key}` }, body: { model, messages, temperature, max_tokens: maxTokens } });
      const text = clean(j?.choices?.[0]?.message?.content);
      if (text) return { text, model, provider: 'Groq' };
      notes.push(`${model}: empty`);
    } catch (e) {
      if (e.status === 401 || e.status === 403) throw e;
      park(`groq:${model}`, e.status === 429 ? Math.min(120, e.retryAfter || 45) : (e.status === 404 || e.status === 400) ? 3600 : 30);
      notes.push(`${model}: ${e.status === 429 ? 'rate-limited' : (e.message || 'failed').slice(0, 50)}`);
    }
  }
  throw new Error(`Groq: ${notes.join(' · ') || 'all models cooling down'}`);
}

export async function geminiChat(messages, { purpose = 'fast', maxTokens = 1024, temperature = 0.3 } = {}) {
  const key = aiKey('GEMINI_API_KEY');
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY not set'), { status: -1 });
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
  const models = purpose === 'quality' ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] : ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  let last;
  for (const model of models) {
    if (isParked(`gemini:${model}`)) continue;
    try {
      const j = await call(`${GEMINI}/${model}:generateContent`, {
        headers: { 'x-goog-api-key': key },
        body: { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { temperature, maxOutputTokens: maxTokens } },
      });
      const text = clean((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
      if (text) return { text, model, provider: 'Gemini' };
      last = new Error(`${model}: empty`);
    } catch (e) {
      last = e;
      if (e.status === 401 || e.status === 403) throw e;
      park(`gemini:${model}`, e.status === 429 ? 60 : 30);
    }
  }
  throw last || new Error('Gemini: cooling down');
}

/** Groq → Gemini → keyless free GPT. Returns { text, model, provider }. Throws one readable error. */
export async function smartChat(messages, opts = {}) {
  const notes = [];
  const steps = [
    ['Groq', () => groqChat(messages, opts), () => !!aiKey('GROQ_API_KEY')],
    ['Gemini', () => geminiChat(messages, opts), () => !!aiKey('GEMINI_API_KEY')],
    ['Free GPT', async () => { const r = await aiChat(messages, { maxTokens: opts.maxTokens || 1024 }); return { text: r.text, model: r.model || 'free', provider: 'Free GPT' }; }, () => true],
  ];
  for (const [name, run, ready] of steps) {
    if (!ready()) continue;
    try { return await run(); } catch (e) { notes.push(`${name}: ${String(e.message || 'failed').split('\n')[0].slice(0, 120)}`); }
  }
  const err = new Error(`No AI provider answered (${notes.join(' | ')})`);
  err.notes = notes;
  throw err;
}
