// ─────────────────────────────────────────────
// Al-Jin · modules/stickers.js
// .sticker (.s) — convert image / video / gif / quoted media to WhatsApp sticker (.webp)
// .toimg (.tovid) — convert quoted WebP sticker to image (JPG) or video (MP4)
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { ffmpegPath } from '../lib/ffmpeg-resolver.js';
import { getTmpDir, cleanFile } from '../lib/ytdlp.js';

/**
 * Downloads media from Baileys message node into a Buffer
 */
async function downloadMedia(node, type) {
  const stream = await downloadContentFromMessage(node, type);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Runs ffmpeg command asynchronously with timeout
 */
function runFfmpeg(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    let errorOutput = '';

    const timer = setTimeout(() => {
      try { process.kill('SIGKILL'); } catch {}
      reject(new Error('FFmpeg conversion timed out'));
    }, timeoutMs);

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput.slice(-300)}`));
      }
    });

    process.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Convert media buffer (image / video / gif) to WebP sticker
 */
export async function stickerCommand(sock, chat, msg, args = []) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
  let inputPath = null;
  let outputPath = null;

  try {
    const m = msg.message;
    const ctx = m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    // Find media node
    let node = null;
    let type = null;

    if (quoted?.imageMessage) {
      node = quoted.imageMessage;
      type = 'image';
    } else if (quoted?.videoMessage) {
      node = quoted.videoMessage;
      type = 'video';
    } else if (m?.imageMessage) {
      node = m.imageMessage;
      type = 'image';
    } else if (m?.videoMessage) {
      node = m.videoMessage;
      type = 'video';
    }

    if (!node) {
      return reply('🎨 *sticker*\n\nUsage: Send or reply to an image, video, or GIF with `.sticker` or `.s`');
    }

    const mediaBuffer = await downloadMedia(node, type);

    const tmpDir = getTmpDir();
    const id = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const inExt = type === 'video' ? '.mp4' : '.jpg';
    inputPath = path.join(tmpDir, `stk_in_${id}${inExt}`);
    outputPath = path.join(tmpDir, `stk_out_${id}.webp`);

    fs.writeFileSync(inputPath, mediaBuffer);

    // FFmpeg conversion arguments for WhatsApp WebP sticker format
    const ffmpegArgs = [
      '-y',
      '-i', inputPath,
      '-vcodec', 'libwebp',
      '-vf', "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000",
      '-loop', '0',
      '-ss', '00:00:00',
      '-t', '00:00:10',
      '-preset', 'default',
      '-an',
      '-vsync', '0',
      outputPath
    ];

    await runFfmpeg(ffmpegArgs);

    const stickerBuffer = fs.readFileSync(outputPath);
    await sock.sendMessage(chat, { sticker: stickerBuffer }, { quoted: msg });
  } catch (e) {
    return reply(`⚠️ Sticker creation failed: ${e.message}`).catch(() => {});
  } finally {
    if (inputPath) cleanFile(inputPath);
    if (outputPath) cleanFile(outputPath);
  }
}

/**
 * Convert WebP sticker to Image (JPG) or Video (MP4)
 */
export async function toimgCommand(sock, chat, msg, args = []) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
  let inputPath = null;
  let outputPath = null;

  try {
    const m = msg.message;
    const ctx = m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo || m?.stickerMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    let stickerNode = null;
    if (quoted?.stickerMessage) {
      stickerNode = quoted.stickerMessage;
    } else if (m?.stickerMessage) {
      stickerNode = m.stickerMessage;
    }

    if (!stickerNode) {
      return reply('🖼️ *toimg*\n\nUsage: Reply to a sticker with `.toimg`');
    }

    const stickerBuffer = await downloadMedia(stickerNode, 'sticker');
    const isAnimated = Boolean(stickerNode.isAnimated);

    const tmpDir = getTmpDir();
    const id = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    inputPath = path.join(tmpDir, `stk_in_${id}.webp`);
    const outExt = isAnimated ? '.mp4' : '.jpg';
    outputPath = path.join(tmpDir, `stk_out_${id}${outExt}`);

    fs.writeFileSync(inputPath, stickerBuffer);

    let ffmpegArgs = [];
    if (isAnimated) {
      ffmpegArgs = [
        '-y',
        '-i', inputPath,
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        '-movflags', '+faststart',
        '-filter:v', 'crop=trunc(iw/2)*2:trunc(ih/2)*2',
        outputPath
      ];
    } else {
      ffmpegArgs = [
        '-y',
        '-i', inputPath,
        outputPath
      ];
    }

    await runFfmpeg(ffmpegArgs);

    const outputBuffer = fs.readFileSync(outputPath);
    if (isAnimated) {
      await sock.sendMessage(chat, { video: outputBuffer, caption: 'Provided by 𝐀𝐥-𝐉𝐢𝐧' }, { quoted: msg });
    } else {
      await sock.sendMessage(chat, { image: outputBuffer, caption: 'Provided by 𝐀𝐥-𝐉𝐢𝐧' }, { quoted: msg });
    }
  } catch (e) {
    return reply(`⚠️ Conversion failed: ${e.message}`).catch(() => {});
  } finally {
    if (inputPath) cleanFile(inputPath);
    if (outputPath) cleanFile(outputPath);
  }
}
