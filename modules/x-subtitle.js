// ─────────────────────────────────────────────
//  Al-Jin · modules/x-subtitle.js
//  .subtitle — transcribes a video's speech and burns subtitles into it.
//
//    reply to a video:  .subtitle                 → YouTube-style subtitles burned in
//                       .subtitle netflix | bold  → other looks
//                       .subtitle ur              → force the spoken language (2-letter code)
//                       .subtitle srt             → just the .srt file (no re-encoding, very light)
//
//  Light by design: no new npm packages. Speech-to-text goes through lib/stt.js
//  (Groq → Gemini → Deepgram → OpenAI, plain fetch); burning uses the ffmpeg the bot
//  already has. The video is streamed to disk (never held in RAM), only one job runs
//  at a time, and every temp file is deleted when the job ends — success or not.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { Progress } from '../lib/progress.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { reply, safe, findMedia, ffmpeg, ffmpegHasFilter, bytesToSize } from '../lib/x.js';
import { ffmpegPath, ffprobePath } from '../lib/ffmpeg-resolver.js';
import { getPrefix } from '../core/settings.js';
import { transcribe, configuredProviders, MAX_UPLOAD_BYTES } from '../lib/stt.js';
import { aiKey } from '../lib/ai.js';
import { parseSubtitleArgs, planOutput, detectByScript, normalizeLang } from '../lib/subtitle-args.js';
import { translateSegments } from '../lib/subtitle-translate.js';
import { buildCues, cuesToSrt, cuesToAss, resolveStyle, resolveFont, STYLES, FONTS, DEFAULT_FONT, POSITIONS } from '../lib/subtitle-render.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(HERE, '..', 'fonts');
const P = () => getPrefix();

const MAX_DOWNLOAD_BYTES = Math.min(100, Number(process.env.WRAITH_MAX_DOWNLOAD_MB) || 100) * 1024 * 1024;
const VIDEO_AS_DOC_BYTES = (Number(process.env.WRAITH_VIDEO_AS_DOC_MB) || 64) * 1024 * 1024;
const CHUNK_SECONDS = 600;                       // only used when the audio is too big for one request
const MAX_QUEUE = 3;

export class UserError extends Error {}
export const need = (cond, msg) => { if (!cond) throw new UserError(msg); };

/** Longest video accepted, in minutes (change live:  .setvar SUBTITLE_MAX_MINUTES 30). */
export const maxMinutes = () => Math.min(60, Math.max(1, Number(aiKey('SUBTITLE_MAX_MINUTES')) || 15));

// ── one job at a time ─────────────────────────
let tail = Promise.resolve();
let waiting = 0;
export function enqueue(job) {
  need(waiting < MAX_QUEUE, '⏳ Too many subtitle jobs queued — try again in a minute.');
  waiting++;
  const run = tail.then(job, job);
  tail = run.catch(() => {}).finally(() => { waiting--; });
  return run;
}

// ── helpers ───────────────────────────────────
const listText = (p) => [
  '🎨 *Subtitle styles*',
  Object.entries(STYLES).map(([k, v]) => `• ${v.label} — \`${k}\``).join('\n'),
  '',
  '🔤 *Fonts* (add F1–F8)',
  Object.entries(FONTS).map(([k, v]) => `• *${k}* ${v.label}`).join('\n'),
  '',
  '📍 *Position:* top · mid · bottom (lower)     📏 *Size:* small · medium · big',
  '🌐 *Language:* ur · en · ar … (Urdu/Hindi speech → Roman Urdu automatically)',
  `Examples: \`${p}st ur f3 small lower youtube\`  ·  \`${p}st youtube F1 middle big\`  ·  \`${p}st\``,
].join('\n');

function sweepStale() {
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (!name.startsWith('aljin_sub_')) continue;
      const p = path.join(os.tmpdir(), name);
      if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

/** Streams a WhatsApp media message straight to a file (no big buffer in RAM). */
export async function downloadToFile(media, file, onProgress) {
  const declared = Number(media.node.fileLength || 0);
  need(!declared || declared <= MAX_DOWNLOAD_BYTES, `📦 That file is ${bytesToSize(declared)} — the limit is ${bytesToSize(MAX_DOWNLOAD_BYTES)}.`);
  const stream = await downloadContentFromMessage(media.node, media.kind);
  const out = fs.createWriteStream(file);
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      try { onProgress?.(size, declared); } catch {}
      if (size > MAX_DOWNLOAD_BYTES) throw new UserError(`📦 File is bigger than ${bytesToSize(MAX_DOWNLOAD_BYTES)}.`);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  return size;
}

export function probe(file) {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,width,height:stream_tags=rotate:stream_side_data=rotation:format=duration',
      '-of', 'json', file,
    ], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error('could not read the media file'));
      try {
        const j = JSON.parse(stdout || '{}');
        const v = (j.streams || []).find((s) => s.codec_type === 'video');
        const hasAudio = (j.streams || []).some((s) => s.codec_type === 'audio');
        let w = v?.width || 0, h = v?.height || 0;
        const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0)) % 180;
        if (rot === 90) [w, h] = [h, w];
        resolve({ width: w, height: h, hasAudio, hasVideo: !!v, duration: Number(j.format?.duration) || 0 });
      } catch { reject(new Error('could not read the media file')); }
    });
  });
}

/** Even output size with the long side capped at 1280 px (keeps CPU, RAM and file size low). */
function targetSize(w, h, cap = 1280) {
  const f = Math.min(1, cap / Math.max(w, h));
  const even = (n) => Math.max(2, 2 * Math.round((n * f) / 2));
  return { W: even(w), H: even(h) };
}

export async function extractAudio(input, outFile) {
  // 16 kHz mono 32 kbps MP3 ≈ 0.24 MB per minute — plenty for speech recognition
  await ffmpeg(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', outFile], 180000);
}

async function splitAudio(audio, dir, seconds = CHUNK_SECONDS) {
  await ffmpeg(['-i', audio, '-f', 'segment', '-segment_time', String(seconds), '-c', 'copy', path.join(dir, 'chunk_%03d.mp3')], 120000);
  return fs.readdirSync(dir).filter((f) => /^chunk_\d+\.mp3$/.test(f)).sort().map((f) => path.join(dir, f));
}

/** Transcribes the whole audio file (in chunks when it is too big for one request). */
export async function transcribeAudio(audio, dir, { language, onProvider, chunkSeconds = CHUNK_SECONDS, maxBytes = MAX_UPLOAD_BYTES, onChunk } = {}) {
  if (fs.statSync(audio).size <= maxBytes) return transcribe(audio, { language, onProvider });
  const chunks = await splitAudio(audio, dir, chunkSeconds);
  const all = [];
  let provider = '', detected = '';
  for (let i = 0; i < chunks.length; i++) {
    try { onChunk?.(i, chunks.length); } catch {}
    const r = await transcribe(chunks[i], { language, onProvider });
    provider = r.provider; detected = detected || r.language || '';
    all.push(...r.segments.map((s) => ({ ...s, start: s.start + i * chunkSeconds, end: s.end + i * chunkSeconds })));
    try { fs.unlinkSync(chunks[i]); } catch {}
  }
  return { segments: all, provider, language: detected };
}

/** Burns an ASS file into the video. Runs inside `dir` so no path ever needs filter-escaping. Reports 0..1 progress. */
export function burnSubtitles({ dir, input, output, W, H, timeoutMs, duration = 0, onProgress }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-threads', '2', '-i', input,
      '-vf', `scale=${W}:${H},subtitles=subs.ass:fontsdir=fonts`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-map', '0:v:0', '-map', '0:a:0?', '-dn', '-sn', output,
    ];
    const env = { ...process.env };
    if (fs.existsSync(path.join(dir, 'fonts.conf'))) env.FONTCONFIG_FILE = path.join(dir, 'fonts.conf');
    const child = spawn(ffmpegPath, args, { cwd: dir, env });
    let err = '', buf = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, Math.round(timeoutMs));
    child.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        const m = l.match(/^out_time_(?:us|ms)=(\d+)/);
        if (m && duration > 0) { try { onProgress?.(Math.min(1, Number(m[1]) / 1e6 / duration)); } catch {} }
      }
    });
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited with ${code}`));
    });
  });
}

function copyFonts(dir) {
  const target = path.join(dir, 'fonts');
  fs.mkdirSync(target, { recursive: true });
  try {
    for (const f of fs.readdirSync(FONT_DIR)) if (/\.(ttf|otf)$/i.test(f)) fs.copyFileSync(path.join(FONT_DIR, f), path.join(target, f));
  } catch {}
  // Make fontconfig see the bundled fonts too (system config first, so system fonts stay available) —
  // otherwise Urdu/Arabic glyph fallback can fail on servers with no fonts installed (boxes).
  try {
    fs.writeFileSync(path.join(dir, 'fonts.conf'), `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n<include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n<dir>${target}</dir>\n<cachedir>${path.join(dir, 'fccache')}</cachedir>\n</fontconfig>\n`);
  } catch {}
}

export function makeStatus(sock, chat, msg) {
  let key = null;
  return async (text) => {
    try {
      if (!key) { const sent = await sock.sendMessage(chat, { text }, { quoted: msg }); key = sent?.key || null; }
      else await sock.sendMessage(chat, { text, edit: key });
    } catch {}
  };
}

const NO_KEY_HELP = (p) => [
  '🔑 *Subtitles need a free speech-to-text key*',
  '',
  'Add any ONE of these (Groq is the fastest):',
  `• Groq — console.groq.com → \`${p}setvar GROQ_API_KEY <key>\``,
  `• Gemini — aistudio.google.com/apikey → \`${p}setvar GEMINI_API_KEY <key>\``,
  `• Deepgram — console.deepgram.com → \`${p}setvar DEEPGRAM_API_KEY <key>\``,
  '',
  'Add two or more and the bot switches automatically if one is busy.',
].join('\n');

// ── .subtitle ─────────────────────────────────
const progressMs = () => Math.max(3, Number(process.env.WRAITH_PROGRESS_SEC) || 6) * 1000;

export const subtitle = safe('subtitle', async (sock, chat, msg, args) => {
  const opts = parseSubtitleArgs(args);
  if (opts.list) return reply(sock, chat, msg, listText(P()));
  if (opts.badFont) return reply(sock, chat, msg, `❌ No font ${opts.badFont}.\n\n${listText(P())}`);
  const media = findMedia(msg, ['video', 'audio', 'document']);
  const isMedia = media && (media.kind !== 'document' || /^(video|audio)\//.test(media.mime));

  if (!isMedia) {
    const p = P();
    return reply(sock, chat, msg, [
      '🎬 *Subtitles*',
      '',
      `Reply to a video with \`${p}st\` (or ${p}subtitle). Every option is optional and can come in any order:`,
      `• \`${p}st ur f3 small lower youtube\` — Urdu (Roman), font 3, small, lower, YouTube style`,
      `• \`${p}st youtube F1 middle big\` — style, font, position (top/mid/lower), size (small/medium/big)`,
      `• \`${p}st en\` — translate to another language (en, ur, ar, …)`,
      `• \`${p}st fonts\` — all styles and fonts · \`${p}st srt\` — only the .srt file`,
      'Defaults: detected language (Urdu/Hindi → Roman Urdu) · youtube · F1 · lower · small',
      `Styles: ${Object.values(STYLES).map((s) => s.label).join(' · ')}`,
      `Up to ${maxMinutes()} min and ${bytesToSize(MAX_DOWNLOAD_BYTES)} per video.`,
      configuredProviders().length ? `Speech engines ready: ${configuredProviders().map((x) => x.name).join(' → ')}` : '⚠️ No speech-to-text key set yet — send this command with a video for setup help.',
    ].join('\n'));
  }
  if (!configuredProviders().length) return reply(sock, chat, msg, NO_KEY_HELP(P()));

  sweepStale();
  const status = makeStatus(sock, chat, msg);
  const queued = waiting > 0;
  if (queued) await status('⏳ Queued — another subtitle job is running…');

  await enqueue(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aljin_sub_'));
    const prog = new Progress(status, { intervalMs: progressMs(), title: '🎬 *Subtitles*' });
    try {
      prog.plan([
        { key: 'download', label: '📥 Downloading video', weight: 8, expectSec: 15 },
        { key: 'audio', label: '🎧 Extracting audio', weight: 4, expectSec: 8 },
        { key: 'stt', label: '🧠 Transcribing speech', weight: 28, expectSec: 30 },
        { key: 'send', label: '📤 Sending', weight: 5, expectSec: 8 },
      ]);
      const input = path.join(dir, 'input.bin');
      prog.begin('download');
      await downloadToFile(media, input, (size, total) => { if (total) prog.set(size / total); });

      const info = await probe(input);
      need(info.hasAudio, '🔇 This file has no audio track, so there is nothing to transcribe.');
      need(!info.duration || info.duration <= maxMinutes() * 60, `⏱️ Video is ${Math.ceil(info.duration / 60)} min — the limit is ${maxMinutes()} min.`);
      const burn = media.kind !== 'audio' && info.hasVideo && !opts.srtOnly;
      if (burn) prog.insertBefore('send', { key: 'burn', label: '🔥 Burning subtitles', weight: 42, expectSec: Math.max(15, (info.duration || 60) * 0.6) });

      prog.begin('audio');
      const audio = path.join(dir, 'audio.mp3');
      await extractAudio(input, audio);

      prog.begin('stt', Math.max(10, (info.duration || 60) / 8));
      const { segments: spoken, provider, language: sttLang } = await transcribeAudio(audio, dir, {
        language: opts.from,
        onChunk: (i, n) => prog.set(i / n),
      });
      try { fs.unlinkSync(audio); } catch {}

      // detected language → Roman Urdu for Urdu/Hindi, or the language the user asked for
      const detected = normalizeLang(sttLang) || detectByScript(spoken.map((x) => x.text).join(' '));
      const plan = planOutput(opts, detected);
      let segments = spoken, langNote = '', warn = '';
      if (plan) {
        prog.insertBefore(burn ? 'burn' : 'send', { key: 'translate', label: `🌐 Translating to ${plan.label}`, weight: 20, expectSec: Math.max(8, spoken.length * 0.7) });
        prog.begin('translate');
        const tr = await translateSegments(spoken, plan, (done, total) => prog.set(total ? done / total : 0));
        segments = tr.segments; langNote = ` · ${plan.label}`; warn = tr.note ? `\n\n⚠️ ${tr.note}` : '';
      }

      const portrait = info.height > info.width;
      const cues = buildCues(segments, { maxChars: portrait ? 44 : 70, duration: info.duration });
      need(cues.length, '🤷 No speech was detected in this video.');
      const srtPath = path.join(dir, 'subtitles.srt');
      fs.writeFileSync(srtPath, cuesToSrt(cues), 'utf8');

      const canBurn = burn && (await ffmpegHasFilter('subtitles'));
      if (!canBurn) {
        const why = !burn ? '' : '\n\nℹ️ This ffmpeg build cannot draw subtitles (no libass), so here is the subtitle file instead.';
        prog.begin('send');
        await sock.sendMessage(chat, {
          document: { url: srtPath }, mimetype: 'application/x-subrip', fileName: 'subtitles.srt',
          caption: `📝 *Subtitles* · ${cues.length} lines${langNote} · ${provider}${why}${warn}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
        }, { quoted: msg });
        prog.stop();
        return status('✅ Done');
      }

      prog.begin('burn');
      const { W, H } = targetSize(info.width || 1280, info.height || 720);
      fs.writeFileSync(path.join(dir, 'subs.ass'), cuesToAss(cues, { width: W, height: H, style: opts.style, font: FONTS[opts.font].family, position: opts.position, sizeMul: opts.sizeMul }), 'utf8');
      copyFonts(dir);
      const output = path.join(dir, 'subtitled.mp4');
      await burnSubtitles({ dir, input, output, W, H, duration: info.duration, onProgress: (f) => prog.set(f), timeoutMs: Math.round(Math.min(25 * 60_000, Math.max(180_000, (info.duration || 60) * 6000))) });
      try { fs.unlinkSync(input); } catch {}   // free disk before uploading

      const size = fs.statSync(output).size;
      const caption = `🎬 *Subtitles added* · ${STYLES[opts.style].label} · ${FONTS[opts.font].family}${langNote} · ${provider}${warn}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
      prog.begin('send');
      if (size > VIDEO_AS_DOC_BYTES) {
        await sock.sendMessage(chat, { document: { url: output }, mimetype: 'video/mp4', fileName: 'subtitled.mp4', caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { video: { url: output }, mimetype: 'video/mp4', caption }, { quoted: msg });
      }
      prog.stop();
      await status('✅ Done');
    } catch (e) {
      prog.stop();
      if (e instanceof UserError) { await status(e.message); return; }
      throw e;
    } finally {
      prog.stop();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });
});
