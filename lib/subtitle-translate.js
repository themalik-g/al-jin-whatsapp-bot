// ─────────────────────────────────────────────
//  Al-Jin · lib/subtitle-translate.js
//  Turns transcript segments into Roman Urdu / Urdu script / another language.
//  Uses the bot's existing free AI chain (lib/ai.js → aiChat). Timing is never touched.
//  Offline fallback: Devanagari (Hindi) → Roman letters, so Hindi never shows blocks.
// ─────────────────────────────────────────────
import { smartChat } from './llm.js';

const BATCH = 14;

// ── offline Devanagari → Roman (fallback only) ──
const V = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o' };
const M = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' };
const C = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h' };
const NUKTA = { 'क': 'q', 'ख': 'kh', 'ग': 'gh', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f' };
export function devanagariToRoman(text) {
  const s = String(text || '').normalize('NFC');
  return s.replace(/[\u0900-\u097F]+/g, (word) => {
    const units = [];                       // { c: consonant, v: vowel text | 'a' (inherent) | '' (halant) }
    let pre = '';
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (C[ch]) {
        let c = C[ch];
        if (word[i + 1] === '\u093C') { c = NUKTA[ch] || c; i++; }
        const nx = word[i + 1];
        if (nx === '\u094D') { units.push({ c, v: '' }); i++; }
        else if (M[nx]) { units.push({ c, v: M[nx] }); i++; }
        else units.push({ c, v: 'a' });
      } else if (V[ch]) units.push({ c: '', v: V[ch] });
      else if (ch === '\u0902' || ch === '\u0901') { if (units.length) units[units.length - 1].v += 'n'; else pre += 'n'; }
      else if (ch === '\u0903') { if (units.length) units[units.length - 1].v += 'h'; }
      else if (ch === '\u0964') pre += '.';
      else if (ch >= '\u0966' && ch <= '\u096F') pre += String(ch.charCodeAt(0) - 0x966);
    }
    // Hindi schwa deletion: final "a" and a medial "a" between a vowel-bearing syllable and an explicit vowel
    const last = units.length - 1;
    units.forEach((u, i) => {
      if (u.v !== 'a' || i === 0) return;
      const prevHasVowel = units[i - 1].v !== '' ;
      const nextExplicit = i < last && units[i + 1].v !== '' && units[i + 1].v !== 'a';
      if (i === last || (prevHasVowel && nextExplicit)) u.v = '';
    });
    return pre + units.map((u) => u.c + (u.v === 'a' ? 'a' : u.v)).join('');
  });
}

// ── prompts ──
function systemPrompt(plan) {
  const common = 'You are a professional subtitle translator. You receive JSON: {"summary":"topic of the whole video","before":[context lines],"lines":[lines to translate],"after":[context lines]}. '
    + 'Reply with ONLY a JSON array of strings with EXACTLY as many items as "lines", same order, no markdown, no comments. '
    + 'Translate the MEANING of each sentence in its context — never word by word. Words with several meanings (homonyms, idioms, slang, politeness levels) must be resolved from the surrounding lines and the summary; keep the speaker\'s tone. '
    + 'Lines are short subtitle fragments: a sentence may continue in the next line, so keep the wording natural across lines. Keep names, numbers and brand names. Never merge or split lines. "before"/"after" are context only — do not translate them.';
  if (plan.kind === 'roman') {
    return `${common}\nOutput language: ROMAN URDU — natural spoken Urdu as people type it on WhatsApp, in plain English letters only (a-z, digits, basic punctuation). `
      + 'If the line is Urdu or Hindi (any script), transliterate it faithfully. If it is another language, first translate it into natural spoken Urdu, then write that in Roman letters. '
      + 'Never output Urdu/Arabic/Devanagari characters. Style: "main to aap ko yehi mashwara dunga ke apna kaam waqt par khatam karein", "aaj mausam bohat acha hai".';
  }
  if (plan.kind === 'urdu-script') return `${common}\nOutput language: Urdu in Urdu (Arabic) script. Convert Hindi/Roman Urdu faithfully; translate other languages naturally.`;
  return `${common}\nOutput language: ${plan.label}. Natural, fluent spoken ${plan.label}.`;
}

function parseArray(text, n) {
  const clean = String(text || '').replace(/```[a-z]*\n?/gi, '').trim();
  const a = clean.indexOf('['), b = clean.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try {
    const arr = JSON.parse(clean.slice(a, b + 1));
    if (Array.isArray(arr) && arr.length === n && arr.every((x) => typeof x === 'string')) return arr.map((x) => x.replace(/\s+/g, ' ').trim());
  } catch {}
  return null;
}

/** One cheap call: what is this video about + tricky terms. Used as context for every batch. */
async function topicSummary(texts) {
  try {
    const r = await smartChat([
      { role: 'system', content: 'In at most 60 words (English) state the topic, speaker tone and any names or ambiguous/technical words with their intended meaning in this transcript. No preamble.' },
      { role: 'user', content: texts.join(' ').slice(0, 3000) },
    ], { purpose: 'quality', maxTokens: 220, temperature: 0.2 });
    return r.text.slice(0, 600);
  } catch { return ''; }
}

async function translateBatch(payload, plan, depth = 0) {
  const lines = payload.lines;
  try {
    const r = await smartChat([
      { role: 'system', content: systemPrompt(plan) },
      { role: 'user', content: JSON.stringify(payload) },
    ], { purpose: 'quality', maxTokens: 3500, temperature: 0.25 });
    const arr = parseArray(r.text, lines.length);
    if (arr) return arr;
  } catch (e) {
    if (depth >= 1 || lines.length === 1) throw e;
  }
  if (lines.length > 1 && depth < 2) {          // malformed answer → retry in smaller halves
    const mid = Math.ceil(lines.length / 2);
    return [
      ...await translateBatch({ ...payload, lines: lines.slice(0, mid), after: lines.slice(mid, mid + 2) }, plan, depth + 1),
      ...await translateBatch({ ...payload, lines: lines.slice(mid), before: lines.slice(Math.max(0, mid - 2), mid) }, plan, depth + 1),
    ];
  }
  throw new Error('AI returned an unusable translation');
}

const hasDev = (t) => /[\u0900-\u097F]/.test(t);
const hasArabic = (t) => /[\u0600-\u06FF]/.test(t);

/**
 * @param {{start:number,end:number,text:string}[]} segments
 * @param {{kind:string,code:string,label:string}} plan
 * @returns {{segments, ok:boolean, note:string}}  never throws; falls back to the original text
 */
export async function translateSegments(segments, plan, onProgress) {
  const texts = segments.map((s) => s.text);
  const out = [...texts];
  let failed = 0, lastErr = '';
  const summary = await topicSummary(texts);
  try { onProgress?.(0, texts.length); } catch {}
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    try {
      const tr = await translateBatch({ summary, before: texts.slice(Math.max(0, i - 3), i), lines: slice, after: texts.slice(i + BATCH, i + BATCH + 2) }, plan);
      tr.forEach((t, k) => { if (t) out[i + k] = t; });
    } catch (e) {
      failed += slice.length; lastErr = e?.message || 'failed';
      if (plan.kind === 'roman') slice.forEach((t, k) => { if (hasDev(t)) out[i + k] = devanagariToRoman(t); });
    }
    try { onProgress?.(Math.min(texts.length, i + BATCH), texts.length); } catch {}
  }
  const rendered = out.map((t, i) => ({ ...segments[i], text: plan.kind === 'roman' && hasDev(t) ? devanagariToRoman(t) : t }));
  const stillForeign = plan.kind === 'roman' && rendered.some((s) => hasArabic(s.text));
  const note = failed ? `AI translation unavailable for ${failed} line(s) (${lastErr.split('\n')[0].slice(0, 80)})${stillForeign ? ' — Urdu script kept for those' : ''}` : '';
  return { segments: rendered, ok: !failed, note };
}
