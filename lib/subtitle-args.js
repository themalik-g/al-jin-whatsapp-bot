// ─────────────────────────────────────────────
//  Al-Jin · lib/subtitle-args.js
//  Order-free parser for  .st / .subtitle  options. Pure — no I/O.
//
//    .st ur f3 small lower youtube     .ssubtitle youtube F1 middle big     .st netflix
//
//  Every part is optional and may come in ANY order. Missing parts use the defaults:
//    language → the detected one (Urdu/Hindi speech → Roman Urdu) · font F1 · style youtube
//    position → bottom (lower) · size → small
// ─────────────────────────────────────────────
import { resolveStyle, resolveFont } from './subtitle-render.js';

export const DEFAULTS = Object.freeze({ style: 'youtube', font: 'F1', position: 'bottom', sizeMul: 0.8 });

export const LANG_NAMES = {
  urdu: 'ur', hindi: 'hi', english: 'en', arabic: 'ar', persian: 'fa', farsi: 'fa', pashto: 'ps', punjabi: 'pa', sindhi: 'sd',
  bengali: 'bn', bangla: 'bn', tamil: 'ta', telugu: 'te', marathi: 'mr', gujarati: 'gu', nepali: 'ne', turkish: 'tr', russian: 'ru',
  spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', chinese: 'zh', japanese: 'ja', korean: 'ko',
  indonesian: 'id', malay: 'ms', thai: 'th', vietnamese: 'vi', dutch: 'nl', polish: 'pl', ukrainian: 'uk', swahili: 'sw',
  roman: 'ur', romanurdu: 'ur', hinglish: 'ur',
};
const CODES = new Set(['en', 'ur', 'hi', 'ar', 'fa', 'ps', 'pa', 'sd', 'bn', 'ta', 'te', 'mr', 'gu', 'ne', 'tr', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'id', 'ms', 'th', 'vi', 'nl', 'pl', 'uk', 'sv', 'he', 'el', 'fi', 'cs', 'ro', 'hu', 'da', 'no', 'sw']);
export const LANG_LABEL = { ur: 'Roman Urdu', hi: 'Roman Urdu', en: 'English', ar: 'Arabic', fa: 'Persian', ps: 'Pashto', pa: 'Punjabi', sd: 'Sindhi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', gu: 'Gujarati', ne: 'Nepali', tr: 'Turkish', ru: 'Russian', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian', sw: 'Swahili' };

const POS = { bottom: 'bottom', lower: 'bottom', low: 'bottom', down: 'bottom', under: 'bottom', top: 'top', upper: 'top', up: 'top', mid: 'mid', middle: 'mid', center: 'mid', centre: 'mid' };
const SIZE = { tiny: 0.65, small: 0.8, sm: 0.8, medium: 1, med: 1, big: 1.25, large: 1.25, bigger: 1.25, huge: 1.5, xl: 1.5 };

/**
 * @param {string[]|string} args
 * @returns {{style,font,position,sizeMul,srtOnly,list,badFont,target,from,script,ignored:string[]}}
 */
export function parseSubtitleArgs(args) {
  const out = { ...DEFAULTS, srtOnly: false, list: false, badFont: '', target: '', from: '', script: false, ignored: [] };
  const words = (Array.isArray(args) ? args : [args]).flatMap((a) => String(a ?? '').split(/[\s,]+/)).filter(Boolean);
  for (const raw of words) {
    let a = raw.toLowerCase().replace(/^-+/, '');
    let key = '';
    const eq = a.match(/^([a-z]+)[=:](.+)$/);
    if (eq) { key = eq[1]; a = eq[2]; }
    if (key === 'from' || key === 'src' || key === 'source') { out.from = LANG_NAMES[a] || (CODES.has(a) ? a : ''); continue; }
    if (['font', 'f'].includes(key) || /^font\d+$/.test(a)) a = /^\d+$/.test(a) ? `f${a}` : a.replace(/^font/, 'f');
    if (['default', 'auto', 'normal', 'std', 'standard'].includes(a)) continue;
    if (['srt', 'text', 'file'].includes(a)) out.srtOnly = true;
    else if (['fonts', 'styles', 'list', 'help'].includes(a)) out.list = true;
    else if (['script', 'nastaliq', 'arabic-script'].includes(a)) out.script = true;
    else if (/^f\d+$/.test(a)) { if (resolveFont(a)) out.font = a.toUpperCase(); else out.badFont = a.toUpperCase(); }
    else if (POS[a]) out.position = POS[a];
    else if (SIZE[a]) out.sizeMul = SIZE[a];
    else if (resolveStyle(a)) out.style = resolveStyle(a);
    else if (LANG_NAMES[a]) out.target = LANG_NAMES[a];
    else if (CODES.has(a)) out.target = a;
    else out.ignored.push(raw);
  }
  return out;
}

// ── language detection (used when the speech engine does not report one) ──
const WHISPER_NAMES = { urdu: 'ur', hindi: 'hi', english: 'en', arabic: 'ar', persian: 'fa', punjabi: 'pa', pashto: 'ps', sindhi: 'sd', bengali: 'bn', tamil: 'ta', telugu: 'te', marathi: 'mr', gujarati: 'gu', nepali: 'ne' };
export function normalizeLang(l) {
  const s = String(l || '').toLowerCase().trim();
  if (!s) return '';
  if (WHISPER_NAMES[s]) return WHISPER_NAMES[s];
  return s.split(/[-_]/)[0].slice(0, 2);
}
export function detectByScript(text) {
  const t = String(text || '');
  const dev = (t.match(/[\u0900-\u097F]/g) || []).length;
  const ar = (t.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  if (dev > ar && dev > lat * 0.3) return 'hi';
  if (ar > lat * 0.3) return /[ٹڈڑںھہۓےگچپژک]/.test(t) && /[ٹڈڑںھہے]/.test(t) ? 'ur' : 'ar';
  return lat ? 'en' : '';
}

/**
 * Decides what to do with the transcript.
 * @returns {null | {kind:'roman'|'urdu-script'|'lang', code:string, label:string}}  null = keep as spoken
 */
export function planOutput(opts, detected) {
  const det = normalizeLang(detected);
  const t = opts.target;
  if (t === 'ur' || t === 'hi') {
    return opts.script && t === 'ur'
      ? { kind: 'urdu-script', code: 'ur', label: 'Urdu' }
      : { kind: 'roman', code: 'ur', label: 'Roman Urdu' };
  }
  if (t) return t === det ? null : { kind: 'lang', code: t, label: LANG_LABEL[t] || t.toUpperCase() };
  if (det === 'ur' || det === 'hi') return { kind: 'roman', code: 'ur', label: 'Roman Urdu' };
  return null;
}

/** Language code from a user word ("urdu", "ur", "en") or '' — used by .trt / .trb. */
export const langFromWord = (w) => { const a = String(w || '').toLowerCase().replace(/^-+/, ''); return LANG_NAMES[a] || (CODES.has(a) ? a : ''); };
const SKIP_NAMES = new Set(['roman', 'romanurdu', 'hinglish', 'farsi', 'bangla']);
/** Display name for a language code ("ur" → "Urdu"). */
export function langName(code) {
  const c = normalizeLang(code);
  for (const [k, v] of Object.entries(LANG_NAMES)) if (v === c && !SKIP_NAMES.has(k)) return k[0].toUpperCase() + k.slice(1);
  return c ? c.toUpperCase() : 'Unknown';
}
