// ─────────────────────────────────────────────
//  Al-Jin · modules/x-audio.js
//    .trb  (alias .transcribe)   reply to audio / voice note / video → the speech as text
//    .trt <lang>                 reply to audio / voice note / video → transcript + translation
//                                (replying to a normal text message still translates the text as before)
//  Same engines as subtitles: speech-to-text (Groq → Gemini → Deepgram → OpenAI), translation via Groq → Gemini → free GPT.
//  Progress with % and estimated time left is edited into one message.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reply, safe, findMedia } from '../lib/x.js';
import { getPrefix } from '../core/settings.js';
import { configuredProviders } from '../lib/stt.js';
import { Progress } from '../lib/progress.js';
import { planOutput, detectByScript, normalizeLang, langFromWord, langName } from '../lib/subtitle-args.js';
import { translateSegments } from '../lib/subtitle-translate.js';
import { buildCues, cuesToSrt } from '../lib/subtitle-render.js';
import { UserError, need, maxMinutes, enqueue, makeStatus, downloadToFile, probe, extractAudio, transcribeAudio } from './x-subtitle.js';

const P = () => getPrefix();
const progressMs = () => Math.max(3, Number(process.env.WRAITH_PROGRESS_SEC) || 6) * 1000;
const isAudioLike = (m) => m && (m.kind !== 'document' || /^(video|audio)\//.test(m.mime || ''));

/** Groups segments into readable paragraphs (new paragraph on a pause or after ~450 chars). */
export function paragraphs(segments) {
  const out = [];
  let cur = '', lastEnd = 0;
  for (const s of segments) {
    const gap = s.start - lastEnd;
    if (cur && (gap > 2 || cur.length > 450)) { out.push(cur.trim()); cur = ''; }
    cur += `${cur ? ' ' : ''}${s.text}`;
    lastEnd = s.end;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function chunkMessage(text, max = 3500) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function parseAudioArgs(args) {
  const o = { target: '', from: '', roman: false, srt: false };
  for (const raw of (args || []).flatMap((a) => String(a).split(/[\s,]+/)).filter(Boolean)) {
    const a = raw.toLowerCase().replace(/^-+/, '');
    const eq = a.match(/^(from|src|to|lang)[=:](.+)$/);
    if (eq) { const c = langFromWord(eq[2]); if (eq[1] === 'from' || eq[1] === 'src') o.from = c; else if (c) o.target = c; continue; }
    if (['roman', 'romanurdu', 'rur', 'hinglish'].includes(a)) { o.roman = true; if (!o.target) o.target = 'ur'; continue; }
    if (a === 'srt') { o.srt = true; continue; }
    const c = langFromWord(a);
    if (c) o.target = c;
  }
  return o;
}

async function run(sock, chat, msg, args, media, mode) {
  const opts = parseAudioArgs(args);
  if (!configuredProviders().length) {
    return reply(sock, chat, msg, `🔑 Speech-to-text needs a free key. Send \`${P()}setvar GROQ_API_KEY <key>\` (console.groq.com) — then try again.`);
  }
  const status = makeStatus(sock, chat, msg);
  if (enqueueBusy()) await status('⏳ Queued — another audio/subtitle job is running…');
  await enqueue(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aljin_sub_'));
    const prog = new Progress(status, { intervalMs: progressMs(), title: mode === 'trt' ? '🌐 *Audio translation*' : '📝 *Transcription*' });
    try {
      prog.plan([
        { key: 'download', label: '📥 Downloading audio', weight: 12, expectSec: 8 },
        { key: 'audio', label: '🎧 Preparing audio', weight: 8, expectSec: 5 },
        { key: 'stt', label: '🧠 Transcribing speech', weight: 70, expectSec: 20 },
        { key: 'send', label: '📤 Sending', weight: 4, expectSec: 3 },
      ]);
      const input = path.join(dir, 'input.bin');
      prog.begin('download');
      await downloadToFile(media, input, (s, t) => { if (t) prog.set(s / t); });
      const info = await probe(input);
      need(info.hasAudio, '🔇 This file has no audio track.');
      need(!info.duration || info.duration <= maxMinutes() * 60, `⏱️ That is ${Math.ceil(info.duration / 60)} min — the limit is ${maxMinutes()} min.`);
      prog.begin('audio');
      const audio = path.join(dir, 'audio.mp3');
      await extractAudio(input, audio);
      prog.begin('stt', Math.max(6, (info.duration || 30) / 10));
      const { segments, provider, language } = await transcribeAudio(audio, dir, { language: opts.from, onChunk: (i, n) => prog.set(i / n) });
      const detected = normalizeLang(language) || detectByScript(segments.map((x) => x.text).join(' '));
      const from = langName(detected);

      // what to produce
      let plan = null;
      if (mode === 'trt') {
        const target = opts.target || (detected === 'en' ? 'ur' : 'en');
        plan = target === detected ? null
          : target === 'ur' ? (opts.roman ? { kind: 'roman', code: 'ur', label: 'Roman Urdu' } : { kind: 'urdu-script', code: 'ur', label: 'Urdu' })
            : target === 'hi' ? { kind: 'lang', code: 'hi', label: 'Hindi' }
              : planOutput({ target }, detected);
      } else if (opts.roman && (detected === 'ur' || detected === 'hi')) plan = { kind: 'roman', code: 'ur', label: 'Roman Urdu' };

      let translated = null, note = '';
      if (plan) {
        prog.insertBefore('send', { key: 'translate', label: `🌐 Translating to ${plan.label}`, weight: 30, expectSec: Math.max(6, segments.length * 0.7) });
        prog.begin('translate');
        const tr = await translateSegments(segments, plan, (d, t) => prog.set(t ? d / t : 0));
        translated = tr.segments; note = tr.note;
      }

      prog.begin('send');
      const mins = info.duration ? ` · ${Math.floor(info.duration / 60)}:${String(Math.round(info.duration % 60)).padStart(2, '0')}` : '';
      if (opts.srt && mode === 'trb') {
        const srt = path.join(dir, 'transcript.srt');
        fs.writeFileSync(srt, cuesToSrt(buildCues(translated || segments, { maxChars: 70, duration: info.duration })), 'utf8');
        await sock.sendMessage(chat, { document: { url: srt }, mimetype: 'application/x-subrip', fileName: 'transcript.srt', caption: `📝 Transcript (${from}) · ${provider}` }, { quoted: msg });
      } else if (mode === 'trb') {
        const text = paragraphs(translated || segments).join('\n\n');
        for (const [i, part] of chunkMessage(`📝 *Transcript* · ${plan ? plan.label : from}${mins} · ${provider}\n\n${text}`).entries()) {
          await sock.sendMessage(chat, { text: i ? part : part }, { quoted: msg });
        }
      } else {
        if (!plan) await sock.sendMessage(chat, { text: `ℹ️ The audio is already in ${from}. Pick another language, e.g. \`${P()}trt ur\`.\n\n${paragraphs(segments).join('\n\n')}` }, { quoted: msg });
        else {
          const orig = `🎙️ *Original* · ${from}${mins}\n\n${paragraphs(segments).join('\n\n')}`;
          const trans = `🌐 *${plan.label}*\n\n${paragraphs(translated).join('\n\n')}${note ? `\n\n⚠️ ${note}` : ''}`;
          for (const part of [...chunkMessage(trans), ...chunkMessage(orig)]) await sock.sendMessage(chat, { text: part }, { quoted: msg });
        }
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
}

// the subtitle queue is shared; a tiny probe so we can tell the user they are waiting
let busy = 0;
const enqueueBusy = () => busy > 0;
const tracked = (fn) => async (...a) => { busy++; try { return await fn(...a); } finally { busy--; } };

export const trb = safe('trb', tracked(async (sock, chat, msg, args) => {
  const media = findMedia(msg, ['audio', 'video', 'document']);
  if (!isAudioLike(media)) {
    return reply(sock, chat, msg, `📝 Reply to a voice note, audio or video with \`${P()}trb\` to get the text.\n• \`${P()}trb roman\` — Roman Urdu (for Urdu/Hindi speech)\n• \`${P()}trb srt\` — timed .srt file`);
  }
  return run(sock, chat, msg, args, media, 'trb');
}));

export const trt = safe('trt', tracked(async (sock, chat, msg, args) => {
  const media = findMedia(msg, ['audio', 'video', 'document']);
  if (isAudioLike(media)) return run(sock, chat, msg, args, media, 'trt');
  // not an audio reply → the classic text translator
  const web = await import('./x-web.js');
  return web.translate(sock, chat, msg, args);
}));
