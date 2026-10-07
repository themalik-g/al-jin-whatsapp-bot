// ─────────────────────────────────────────────
//  Al-Jin · lib/subtitle-render.js
//  Pure helpers (no I/O): readable cue splitting, SRT text, ASS styling.
//  The ASS file is sized from the REAL video dimensions, so the same preset looks
//  right on a 1920×1080 clip and on a 720×1280 phone video.
// ─────────────────────────────────────────────

export const STYLES = {
  youtube: { label: 'YouTube Classic', scale: 1.0,  bold: 0, primary: '&H00FFFFFF', outline: '&H00000000', back: '&H99000000', box: true,  outlineW: 0.10, shadow: 0 },
  netflix: { label: 'Netflix',         scale: 0.95, bold: 1, primary: '&H00FFFFFF', outline: '&H00000000', back: '&H80000000', box: false, outlineW: 0.05, shadow: 0.07 },
  boldpop: { label: 'Bold Pop',        scale: 1.15, bold: 1, primary: '&H0000F0FF', outline: '&H00000000', back: '&H00000000', box: false, outlineW: 0.13, shadow: 0 },
};
export const STYLE_ALIASES = { yt: 'youtube', classic: 'youtube', youtube: 'youtube', netflix: 'netflix', nf: 'netflix', clean: 'netflix', bold: 'boldpop', pop: 'boldpop', boldpop: 'boldpop' };

/** Seconds → "HH:MM:SS,mmm" (integer maths, so rounding can never print ",1000"). */
export function formatTimestamp(seconds, sep = ',') {
  const total = Math.max(0, Math.round(Number(seconds) * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}

/** ASS uses H:MM:SS.cc (centiseconds). */
export function assTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) * 100));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const h = Math.floor(total / 360000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const cleanText = (t) => String(t || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Breaks one long string into pieces ≤ max characters, preferring spaces / punctuation. */
function chunkText(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = -1;
    for (const re of [/[.!?؟。！？]\s/g, /[,;:،؛、]\s/g, /\s/g]) {
      let m, best = -1;
      re.lastIndex = 0;
      while ((m = re.exec(rest)) && m.index < max) best = m.index + 1;
      if (best > max * 0.4) { cut = best; break; }
    }
    if (cut < 0) cut = max;                     // no good break (e.g. CJK) → hard cut
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/**
 * Turns raw transcript segments into short, readable, non-overlapping cues.
 * @param {{start:number,end:number,text:string}[]} segments
 * @param {{maxChars?:number, duration?:number}} opt   maxChars per cue (≈ two lines)
 */
export function buildCues(segments, { maxChars = 70, duration = 0 } = {}) {
  const cues = [];
  const list = [...segments].filter((s) => s && cleanText(s.text)).sort((a, b) => a.start - b.start);
  for (const seg of list) {
    const text = cleanText(seg.text);
    const start = Math.max(0, seg.start);
    const end = Math.max(seg.end, start + 0.4);
    const parts = chunkText(text, maxChars);
    const totalChars = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = start;
    parts.forEach((p, i) => {
      const span = (end - start) * (p.length / totalChars);
      cues.push({ start: t, end: i === parts.length - 1 ? end : t + span, text: p });
      t += span;
    });
  }
  // chronological, no overlaps, no zero-length cues, nothing past the end of the video
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const next = cues[i + 1];
    if (next && c.end > next.start - 0.02) c.end = Math.max(c.start + 0.3, next.start - 0.02);
    if (c.end - c.start < 0.3) c.end = c.start + 0.3;
    if (duration && c.end > duration) c.end = duration;
  }
  return cues.filter((c) => c.end > c.start && (!duration || c.start < duration));
}

export function cuesToSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text}\n`).join('\n');
}

const assEscape = (t) => String(t).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\n/g, '\\N');

/**
 * Full ASS document for the given cues, scaled to width × height.
 * `font` is the font family name to request (the bundled DejaVu Sans by default).
 */
export function cuesToAss(cues, { width, height, style = 'youtube', font = 'DejaVu Sans' }) {
  const st = STYLES[style] || STYLES.youtube;
  const short = Math.min(width, height);
  const portrait = height > width;
  const size = Math.round(short * 0.058 * st.scale);
  const outline = Math.max(1, Math.round(size * st.outlineW));
  const shadow = st.shadow ? Math.max(1, Math.round(size * st.shadow)) : 0;
  const marginV = Math.round(height * (portrait ? 0.11 : 0.06));
  const marginLR = Math.round(width * 0.06);
  const borderStyle = st.box ? 3 : 1;
  // In libass an opaque box (BorderStyle 3) is painted with OutlineColour; Outline is its padding.
  const outlineColour = st.box ? st.back : st.outline;
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${size},${st.primary},&H000000FF,${outlineColour},${st.back},${st.bold ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${st.box ? Math.max(2, Math.round(size * 0.18)) : outline},${shadow},2,${marginLR},${marginLR},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const lines = cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assEscape(c.text)}`);
  return `${header.join('\n')}\n${lines.join('\n')}\n`;
}

/** Picks a style name from a user word ("netflix", "bold", …) or null. */
export const resolveStyle = (word) => STYLE_ALIASES[String(word || '').toLowerCase()] || null;
