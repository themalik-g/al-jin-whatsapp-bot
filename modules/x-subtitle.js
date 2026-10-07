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
import { execFile } from 'node:child_process';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { reply, safe, findMedia, ffmpeg, ffmpegHasFilter, bytesToSize } from '../lib/x.js';
import { ffmpegPath, ffprobePath } from '../lib/ffmpeg-resolver.js';
import { getPrefix } from '../core/settings.js';
import { transcribe, configuredProviders, MAX_UPLOAD_BYTES } from '../lib/stt.js';
import { aiKey } from '../lib/ai.js';
import { buildCues, cuesToSrt, cuesToAss, resolveStyle, STYLES } from '../lib/subtitle-render.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(HERE, '..', 'fonts');
const P = () => getPrefix();

const MAX_DOWNLOAD_BYTES = Math.min(100, Number(process.env.WRAITH_MAX_DOWNLOAD_MB) || 100) * 1024 * 1024;
const VIDEO_AS_DOC_BYTES = (Number(process.env.WRAITH_VIDEO_AS_DOC_MB) || 64) * 1024 * 1024;
const CHUNK_SECONDS = 600;                       // only used when the audio is too big for one request
const MAX_QUEUE = 3;

class UserError extends Error {}
const need = (cond, msg) => { if (!cond) throw new UserError(msg); };

/** Longest video accepted, in minutes (change live:  .setvar SUBTITLE_MAX_MINUTES 30). */
const maxMinutes = () => Math.min(60, Math.max(1, Number(aiKey('SUBTITLE_MAX_MINUTES')) || 15));

// ── one job at a time ─────────────────────────
let tail = Promise.resolve();
let waiting = 0;
function enqueue(job) {
  need(waiting < MAX_QUEUE, '⏳ Too many subtitle jobs queued — try again in a minute.');
  waiting++;
  const run = tail.then(job, job);
  tail = run.catch(() => {}).finally(() => { waiting--; });
  return run;
}

// ── helpers ───────────────────────────────────
function parseArgs(args) {
  const out = { style: 'youtube', srtOnly: false, language: '' };
  for (const raw of args) {
    const a = String(raw).toLowerCase().replace(/^lang=/, '');
    if (['srt', 'text', 'file'].includes(a)) out.srtOnly = true;
    else if (resolveStyle(a)) out.style = resolveStyle(a);
    else if (/^[a-z]{2}$/.test(a)) out.language = a;
  }
  return out;
}

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
async function downloadToFile(media, file) {
  const declared = Number(media.node.fileLength || 0);
  need(!declared || declared <= MAX_DOWNLOAD_BYTES, `📦 That file is ${bytesToSize(declared)} — the limit is ${bytesToSize(MAX_DOWNLOAD_BYTES)}.`);
  const stream = await downloadContentFromMessage(media.node, media.kind);
  const out = fs.createWriteStream(file);
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_DOWNLOAD_BYTES) throw new UserError(`📦 File is bigger than ${bytesToSize(MAX_DOWNLOAD_BYTES)}.`);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  return size;
}

function probe(file) {
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

async function extractAudio(input, outFile) {
  // 16 kHz mono 32 kbps MP3 ≈ 0.24 MB per minute — plenty for speech recognition
  await ffmpeg(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', outFile], 180000);
}

async function splitAudio(audio, dir, seconds = CHUNK_SECONDS) {
  await ffmpeg(['-i', audio, '-f', 'segment', '-segment_time', String(seconds), '-c', 'copy', path.join(dir, 'chunk_%03d.mp3')], 120000);
  return fs.readdirSync(dir).filter((f) => /^chunk_\d+\.mp3$/.test(f)).sort().map((f) => path.join(dir, f));
}

/** Transcribes the whole audio file (in chunks when it is too big for one request). */
export async function transcribeAudio(audio, dir, { language, onProvider, chunkSeconds = CHUNK_SECONDS, maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (fs.statSync(audio).size <= maxBytes) return transcribe(audio, { language, onProvider });
  const chunks = await splitAudio(audio, dir, chunkSeconds);
  const all = [];
  let provider = '';
  for (let i = 0; i < chunks.length; i++) {
    const r = await transcribe(chunks[i], { language, onProvider });
    provider = r.provider;
    all.push(...r.segments.map((s) => ({ ...s, start: s.start + i * chunkSeconds, end: s.end + i * chunkSeconds })));
    try { fs.unlinkSync(chunks[i]); } catch {}
  }
  return { segments: all, provider };
}

/** Burns an ASS file into the video. Runs inside `dir` so no path ever needs filter-escaping. */
export function burnSubtitles({ dir, input, output, W, H, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-v', 'error', '-threads', '2', '-i', input,
      '-vf', `scale=${W}:${H},subtitles=subs.ass:fontsdir=fonts`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-map', '0:v:0', '-map', '0:a:0?', '-dn', '-sn', output,
    ];
    execFile(ffmpegPath, args, { cwd: dir, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').pop() || 'ffmpeg failed'));
      resolve();
    });
  });
}

function copyFonts(dir) {
  const target = path.join(dir, 'fonts');
  fs.mkdirSync(target, { recursive: true });
  try {
    for (const f of fs.readdirSync(FONT_DIR)) if (/\.(ttf|otf)$/i.test(f)) fs.copyFileSync(path.join(FONT_DIR, f), path.join(target, f));
  } catch {}
}

function makeStatus(sock, chat, msg) {
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
export const subtitle = safe('subtitle', async (sock, chat, msg, args) => {
  const opts = parseArgs(args);
  const media = findMedia(msg, ['video', 'audio', 'document']);
  const isMedia = media && (media.kind !== 'document' || /^(video|audio)\//.test(media.mime));

  if (!isMedia) {
    const p = P();
    return reply(sock, chat, msg, [
      '🎬 *Subtitles*',
      '',
      `Reply to a video with \`${p}subtitle\``,
      `• \`${p}subtitle netflix\` · \`${p}subtitle bold\` — other looks (default: youtube)`,
      `• \`${p}subtitle ur\` — force the spoken language (en, ur, hi, ar…)`,
      `• \`${p}subtitle srt\` — only the .srt file, no re-encoding`,
      '',
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
    try {
      const input = path.join(dir, 'input.bin');
      await status('📥 Downloading video…');
      await downloadToFile(media, input);

      const info = await probe(input);
      need(info.hasAudio, '🔇 This file has no audio track, so there is nothing to transcribe.');
      need(!info.duration || info.duration <= maxMinutes() * 60, `⏱️ Video is ${Math.ceil(info.duration / 60)} min — the limit is ${maxMinutes()} min.`);
      const burn = media.kind !== 'audio' && info.hasVideo && !opts.srtOnly;

      await status('🎧 Extracting audio…');
      const audio = path.join(dir, 'audio.mp3');
      await extractAudio(input, audio);

      await status('🧠 Listening…');
      let engine = '';
      const { segments, provider } = await transcribeAudio(audio, dir, {
        language: opts.language,
        onProvider: (n) => { if (n !== engine) { engine = n; status(`🧠 Transcribing with ${n}…`); } },
      });
      try { fs.unlinkSync(audio); } catch {}

      const portrait = info.height > info.width;
      const cues = buildCues(segments, { maxChars: portrait ? 44 : 70, duration: info.duration });
      need(cues.length, '🤷 No speech was detected in this video.');
      const srtPath = path.join(dir, 'subtitles.srt');
      fs.writeFileSync(srtPath, cuesToSrt(cues), 'utf8');

      const canBurn = burn && (await ffmpegHasFilter('subtitles'));
      if (!canBurn) {
        const why = !burn ? '' : '\n\nℹ️ This ffmpeg build cannot draw subtitles (no libass), so here is the subtitle file instead.';
        await sock.sendMessage(chat, {
          document: { url: srtPath }, mimetype: 'application/x-subrip', fileName: 'subtitles.srt',
          caption: `📝 *Subtitles* · ${cues.length} lines · ${provider}${why}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
        }, { quoted: msg });
        return status('✅ Done');
      }

      await status('🎨 Burning subtitles…');
      const { W, H } = targetSize(info.width || 1280, info.height || 720);
      fs.writeFileSync(path.join(dir, 'subs.ass'), cuesToAss(cues, { width: W, height: H, style: opts.style }), 'utf8');
      copyFonts(dir);
      const output = path.join(dir, 'subtitled.mp4');
      await burnSubtitles({ dir, input, output, W, H, timeoutMs: Math.min(25 * 60_000, Math.max(180_000, (info.duration || 60) * 6000)) });
      try { fs.unlinkSync(input); } catch {}   // free disk before uploading

      const size = fs.statSync(output).size;
      const caption = `🎬 *Subtitles added* · ${STYLES[opts.style].label} · ${provider}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
      await status('📤 Sending…');
      if (size > VIDEO_AS_DOC_BYTES) {
        await sock.sendMessage(chat, { document: { url: output }, mimetype: 'video/mp4', fileName: 'subtitled.mp4', caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { video: { url: output }, mimetype: 'video/mp4', caption }, { quoted: msg });
      }
      await status('✅ Done');
    } catch (e) {
      if (e instanceof UserError) { await status(e.message); return; }
      throw e;
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });
});
