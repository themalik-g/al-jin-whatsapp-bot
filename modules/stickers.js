// ─────────────────────────────────────────────
// Al-Jin · modules/stickers.js
//   .sticker (.s)  image / video / GIF  →  WhatsApp sticker (static or animated WebP)
//   .toimg         sticker              →  image (JPEG; first frame if animated)
//   .tovid         sticker              →  video (MP4; animated stickers keep their animation)
//
// Animated WebP cannot be decoded by FFmpeg, so .toimg/.tovid use lib/webp-anim.js
// (pure JS container parser + compositor, no extra dependency).
// Every command is wrapped so a failure is reported in chat and never crashes the bot.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import PQueue from 'p-queue';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { ffmpegPath } from '../lib/ffmpeg-resolver.js';
import { getTmpDir, cleanFile } from '../lib/ytdlp.js';
import { inspectWebp, webpToMp4, webpToJpg } from '../lib/webp-anim.js';

const BRAND = 'Provided by 𝐀𝐥-𝐉𝐢𝐧';
const MAX_INPUT_BYTES = 25 * 1024 * 1024;       // stickers never need more (rule: stay far below 100 MB)
const STATIC_LIMIT = 95 * 1024;                 // WhatsApp: static sticker ≤ 100 KB
const ANIMATED_LIMIT = 480 * 1024;              // WhatsApp: animated sticker ≤ 500 KB

// At most 2 conversions at once → bounded CPU / RAM on small servers.
const queue = new PQueue({ concurrency: 2 });

// ── helpers ──────────────────────────────────────────────────────────────
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function fail(message, userMessage) {
  const e = new Error(message);
  e.userMessage = userMessage;
  return e;
}

/** Runs ffmpeg with a hard timeout; the error carries a short, safe reason for the chat. */
function runFfmpeg(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(fail('ffmpeg timed out', 'the conversion took too long'));
    }, timeoutMs);
    child.stderr.on('data', (d) => { err = (err + d.toString()).slice(-600); });
    child.on('error', (e) => { clearTimeout(timer); reject(fail(e.message, 'FFmpeg is not available on this server')); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const why = /Unknown encoder|Encoder .* not found/i.test(err)
        ? 'this server\'s FFmpeg has no WebP encoder'
        : 'the media is unsupported or corrupt';
      reject(fail(`ffmpeg exited ${code}: ${err.trim().split('\n').pop()}`, why));
    });
  });
}

function unwrap(x) {
  return x?.ephemeralMessage?.message || x?.viewOnceMessage?.message || x?.viewOnceMessageV2?.message
    || x?.documentWithCaptionMessage?.message || x;
}

function classify(x) {
  if (!x) return null;
  if (x.imageMessage) {
    const n = x.imageMessage;
    return { node: n, kind: 'image', animated: /gif/i.test(n.mimetype || '') };
  }
  if (x.videoMessage) return { node: x.videoMessage, kind: 'video', animated: true };      // includes WhatsApp "GIFs"
  if (x.documentMessage) {
    const n = x.documentMessage;
    const mime = n.mimetype || '';
    if (mime.startsWith('video/') || /gif/i.test(mime)) return { node: n, kind: 'document', animated: true };
    if (mime.startsWith('image/')) return { node: n, kind: 'document', animated: false };
  }
  return null;
}

function contextOf(m) {
  return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo
    || m?.documentMessage?.contextInfo || m?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo
    || m?.stickerMessage?.contextInfo;
}

async function downloadToFile(node, kind, filePath) {
  const stream = await downloadContentFromMessage(node, kind);
  await pipeline(stream, fs.createWriteStream(filePath));
}

async function downloadToBuffer(node, kind) {
  const stream = await downloadContentFromMessage(node, kind);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

function findQuotedOrOwnSticker(msg) {
  const m = unwrap(msg.message) || {};
  const quoted = unwrap(contextOf(m)?.quotedMessage);
  return quoted?.stickerMessage || m.stickerMessage || null;
}

const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };

// ── .sticker ─────────────────────────────────────────────────────────────
// WhatsApp sticker canvas: 512x512, transparent padding (or `crop` to fill the square).
function stickerFilter(crop) {
  return crop
    ? 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba'
    : 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
}

const STATIC_TRIES = [80, 60, 40, 25];
const ANIMATED_TRIES = [
  { fps: 12, quality: 50, seconds: 8 },
  { fps: 10, quality: 35, seconds: 7 },
  { fps: 8,  quality: 25, seconds: 6 },
  { fps: 8,  quality: 15, seconds: 5 },
];

async function encodeSticker(inputPath, outputPath, { animated, crop }) {
  const vf = stickerFilter(crop);
  if (!animated) {
    for (const q of STATIC_TRIES) {
      await runFfmpeg(['-y', '-v', 'error', '-i', inputPath, '-vf', vf,
        '-c:v', 'libwebp', '-quality', String(q), '-frames:v', '1', '-an', outputPath]);
      if (sizeOf(outputPath) <= STATIC_LIMIT) return;
    }
    throw fail('static sticker still too large', 'the result is too large for a sticker');
  }
  for (const t of ANIMATED_TRIES) {
    await runFfmpeg(['-y', '-v', 'error', '-t', String(t.seconds), '-i', inputPath,
      '-vf', `fps=${t.fps},${vf}`,
      '-c:v', 'libwebp', '-loop', '0', '-preset', 'default', '-compression_level', '4',
      '-quality', String(t.quality), '-an', outputPath], 90000);
    if (sizeOf(outputPath) <= ANIMATED_LIMIT) return;
  }
  throw fail('animated sticker still too large', 'the animation is too large for a sticker — try a shorter clip');
}

export async function stickerCommand(sock, chat, msg, args = []) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  const files = [];
  try {
    const m = unwrap(msg.message) || {};
    const quoted = unwrap(contextOf(m)?.quotedMessage);
    const media = classify(quoted) || classify(m);

    if (!media) {
      return await reply('🎨 *sticker*\n\nSend or reply to an image, video or GIF with `.sticker` (or `.s`).\nAdd `crop` to fill the whole square: `.sticker crop`');
    }
    const declared = Number(media.node.fileLength || 0);
    if (declared > MAX_INPUT_BYTES) {
      return await reply('⚠️ That file is too large for a sticker (max 25 MB).');
    }
    const crop = args.some((a) => /^(crop|fill|full)$/i.test(a));

    await queue.add(async () => {
      const id = uid();
      const inputPath = path.join(getTmpDir(), `stk_in_${id}.bin`);
      const outputPath = path.join(getTmpDir(), `stk_out_${id}.webp`);
      files.push(inputPath, outputPath);

      await downloadToFile(media.node, media.kind, inputPath);
      await encodeSticker(inputPath, outputPath, { animated: media.animated, crop });

      await sock.sendMessage(chat, {
        sticker: { url: outputPath },
        ...(media.animated ? { isAnimated: true } : {}),
      }, { quoted: msg });
    });
  } catch (e) {
    console.error('[sticker]', e?.message || e);
    await reply(`⚠️ Sticker creation failed: ${e?.userMessage || 'the media could not be converted'}.`);
  } finally {
    for (const f of files) cleanFile(f);
  }
}

// ── .toimg / .tovid ──────────────────────────────────────────────────────
async function convertSticker(sock, chat, msg, args, wantVideo) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  const files = [];
  const cmd = wantVideo ? 'tovid' : 'toimg';
  try {
    const node = findQuotedOrOwnSticker(msg);
    if (!node) {
      return await reply(`🖼️ *${cmd}*\n\nReply to a sticker with \`.${cmd}\`.${wantVideo ? '\nAnimated stickers become a video; add `black` for a black background (default white).' : '\nAnimated stickers give their first frame — use `.tovid` for the full video.'}`);
    }
    if (Number(node.fileLength || 0) > MAX_INPUT_BYTES) {
      return await reply('⚠️ That sticker is too large to convert.');
    }
    const background = args.some((a) => /^black$/i.test(a)) ? 'black' : 'white';

    await queue.add(async () => {
      const webp = await downloadToBuffer(node, 'sticker');
      const id = uid();
      const outputPath = path.join(getTmpDir(), `stk_out_${id}.${wantVideo ? 'mp4' : 'jpg'}`);
      files.push(outputPath);

      try { inspectWebp(webp); } catch (e) { throw fail(e.message, 'this is not a valid WebP sticker'); }

      if (wantVideo) {
        await webpToMp4(webp, outputPath, ffmpegPath, { background });
        await sock.sendMessage(chat, { video: { url: outputPath }, mimetype: 'video/mp4', caption: BRAND }, { quoted: msg });
      } else {
        await webpToJpg(webp, outputPath, ffmpegPath, { background });
        await sock.sendMessage(chat, { image: { url: outputPath }, caption: BRAND }, { quoted: msg });
      }
    });
  } catch (e) {
    console.error(`[${cmd}]`, e?.message || e);
    await reply(`⚠️ Conversion failed: ${e?.userMessage || 'the sticker could not be converted'}.`);
  } finally {
    for (const f of files) cleanFile(f);
  }
}

export const toimgCommand = (sock, chat, msg, args = []) => convertSticker(sock, chat, msg, args, false);
export const tovidCommand = (sock, chat, msg, args = []) => convertSticker(sock, chat, msg, args, true);
