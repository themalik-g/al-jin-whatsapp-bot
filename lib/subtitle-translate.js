// ─────────────────────────────────────────────
//  Al-Jin · lib/subtitle-translate.js
//  Turns transcript segments into Roman Urdu / Urdu script / another language.
//  Uses the bot's existing free AI chain (lib/ai.js → aiChat). Timing is never touched.
//  Offline fallback: Devanagari (Hindi) → Roman letters, so Hindi never shows blocks.
// ─────────────────────────────────────────────
import { aiChat } from './ai.js';

const BATCH = 18;

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
  const common = 'You are a subtitle translator. You receive a JSON array of subtitle lines (any language or script). '
    + 'Reply with ONLY a JSON array of strings with EXACTLY the same number of items, same order, no markdown, no comments. '
    + 'Keep every line short and natural for reading on screen. Keep names, numbers and brand names. Never merge or split lines.';
  if (plan.kind === 'roman') {
    return `${common}\nOutput language: ROMAN URDU — Urdu as people type it on WhatsApp, in plain English letters only (a-z, digits, basic punctuation). `
      + 'If the line is Urdu or Hindi (any script), transliterate it faithfully. If it is another language, translate it into natural spoken Urdu first, then write that in Roman letters. '
      + 'Never output Urdu/Arabic/Devanagari characters. Style example: "main to aap ko yehi mashwara dunga ke apna kaam waqt par khatam karein", "aaj mausam bohat acha hai".';
  }
  if (plan.kind === 'urdu-script') return `${common}\nOutput language: Urdu in Urdu (Nastaliq/Arabic) script. Convert Hindi/Roman Urdu faithfully; translate other languages naturally.`;
  return `${common}\nOutput language: ${plan.label}. Translate the meaning naturally (spoken style), not word for word.`;
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

async function translateBatch(lines, plan, depth = 0) {
  try {
    const r = await aiChat([
      { role: 'system', content: systemPrompt(plan) },
      { role: 'user', content: JSON.stringify(lines) },
    ], { maxTokens: 3500 });
    const arr = parseArray(r.text, lines.length);
    if (arr) return arr;
  } catch (e) {
    if (depth >= 1 || lines.length === 1) throw e;
  }
  if (lines.length > 1 && depth < 2) {          // malformed answer → retry in smaller halves
    const mid = Math.ceil(lines.length / 2);
    return [...await translateBatch(lines.slice(0, mid), plan, depth + 1), ...await translateBatch(lines.slice(mid), plan, depth + 1)];
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
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    try {
      const tr = await translateBatch(slice, plan);
      tr.forEach((t, k) => { if (t) out[i + k] = t; });
    } catch (e) {
      failed += slice.length; lastErr = e?.message || 'failed';
      if (plan.kind === 'roman') slice.forEach((t, k) => { if (hasDev(t)) out[i + k] = devanagariToRoman(t); });
    }
    try { onProgress?.(Math.min(texts.length, i + BATCH), texts.length); } catch {}
  }
  const rendered = out.map((t, i) => ({ ...segments[i], text: t }));
  const stillForeign = plan.kind === 'roman' && rendered.some((s) => hasArabic(s.text));
  const note = failed ? `AI translation unavailable for ${failed} line(s) (${lastErr.split('\n')[0].slice(0, 80)})${stillForeign ? ' — Urdu script kept for those' : ''}` : '';
  return { segments: rendered, ok: !failed, note };
}
