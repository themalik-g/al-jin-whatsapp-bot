// ─────────────────────────────────────────────
// WRAITH · modules/ytdlp-commands.js
// .play, .ytv, .ytdl commands via ytdlp-nodejs
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import { getTmpDir, runYtdlp, cleanPrefix, cleanOldTmpFiles } from '../lib/ytdlp.js';
import { sendWithCta } from '../lib/buttons.js';
import { ensurePlayable, probe } from '../lib/video-converter.js';

const queue = new PQueue({ concurrency: 1 });
const MAX_VIDEO_BYTES = 400 * 1024 * 1024; // 400 MB cap
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;  // 50 MB cap for WhatsApp audio

async function react(sock, chat, msg, emoji) {
  try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {}
}

async function edit(sock, chat, key, text) {
  try { await sock.sendMessage(chat, { text, edit: key.key }); } catch {}
}

function resolveTarget(input) {
  const isUrl = /^https?:\/\//i.test(input);
  return isUrl ? input : `ytsearch1:${input}`;
}

export async function playCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎵 *Usage:* `.play <song name or url>`', { quoted: msg });
  }

  return queue.add(async () => {
    cleanOldTmpFiles();
    const status = await sock.sendMessage(chat, { text: `🎵 *Searching:* ${query}` }, { quoted: msg });

    const filePrefix = `play_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();
    const outputTemplate = path.join(outputDir, `${filePrefix}_%(title).50s.%(ext)s`);

    try {
      const isUrl = /^https?:\/\//i.test(query);
      const targets = isUrl ? [query] : [`ytsearch1:${query}`, `scsearch1:${query}`];

      let downloadedPath = null;
      let lastErr = null;

      for (const target of targets) {
        try {
          if (target.startsWith('scsearch1:')) {
            await edit(sock, chat, status, `🎵 *YouTube extraction failed; falling back to SoundCloud…*`);
          } else {
            await edit(sock, chat, status, `🎵 *Extracting audio with ytdlp-nodejs…*`);
          }

          downloadedPath = await runYtdlp(target, outputDir, filePrefix, (dl) =>
            dl.extractAudio().audioFormat('mp3').audioQuality('0').output(outputTemplate));
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!downloadedPath || !fs.existsSync(downloadedPath)) {
        throw lastErr || new Error('No audio file created by ytdlp-nodejs');
      }

      const stat = fs.statSync(downloadedPath);
      if (stat.size > MAX_AUDIO_BYTES) {
        throw new Error(`Audio file size (${(stat.size / (1024 * 1024)).toFixed(1)} MB) exceeds WhatsApp limit (50 MB)`);
      }

      await edit(sock, chat, status, `🎵 *Sending audio…*`);
      const fileName = path.basename(downloadedPath);
      let audioBuffer = fs.readFileSync(downloadedPath);

      await sock.sendMessage(chat, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: fileName,
        ptt: false,
      }, { quoted: msg });
      audioBuffer = null;

      await edit(sock, chat, status, `✅ *Audio downloaded successfully*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`);
      await react(sock, chat, msg, '☑');
    } catch (e) {
      console.error('[playCommand]', e);
      await edit(sock, chat, status, `❌ *Play failed:* ${e.message}`);
      await react(sock, chat, msg, '❌');
    } finally {
      cleanPrefix(filePrefix, outputDir);
      if (global.gc) { try { global.gc(); } catch {} }
    }
  });
}

export async function ytvCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎬 *Usage:* `.ytv <video title or url>` or `.video <video title or url>`', { quoted: msg });
  }

  return queue.add(async () => {
    cleanOldTmpFiles();
    const status = await sock.sendMessage(chat, { text: `🎬 *Searching video:* ${query}` }, { quoted: msg });

    const filePrefix = `ytv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();
    const outputTemplate = path.join(outputDir, `${filePrefix}_%(title).50s.%(ext)s`);

    try {
      const target = resolveTarget(query);
      await edit(sock, chat, status, `🎬 *Downloading video with ytdlp-nodejs…*`);

      const downloadedPath = await runYtdlp(target, outputDir, filePrefix, (dl) =>
        dl.addArgs('-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outputTemplate));


      try {
        const info = await probe(downloadedPath);
        if (!info.video) throw new Error('Downloaded file has no video track (yt-dlp could not merge video+audio — ffmpeg problem)');
      } catch (pe) {
        if (/no video track/.test(pe.message)) throw pe;
      }

      await edit(sock, chat, status, `🎬 *Optimizing video for WhatsApp playability…*`);
      const convertedPath = path.join(outputDir, `${filePrefix}_playable.mp4`);
      const finalVideoPath = await ensurePlayable(downloadedPath, convertedPath);

      const stat = fs.statSync(finalVideoPath);
      if (stat.size > MAX_VIDEO_BYTES) {
        throw new Error(`Video file size (${(stat.size / (1024 * 1024)).toFixed(1)} MB) exceeds 400 MB cap limit`);
      }

      await edit(sock, chat, status, `🎬 *Sending video (${(stat.size / (1024 * 1024)).toFixed(1)} MB)…*`);
      const fileName = path.basename(finalVideoPath);
      let videoBuffer = fs.readFileSync(finalVideoPath);

      await sock.sendMessage(chat, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        fileName: fileName,
        caption: `🎬 *YouTube Video*\nSize: ${(stat.size / (1024 * 1024)).toFixed(1)} MB\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`,
      }, { quoted: msg });
      videoBuffer = null;

      await edit(sock, chat, status, `✅ *Video downloaded successfully*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`);
      await react(sock, chat, msg, '☑');
    } catch (e) {
      console.error('[ytvCommand]', e);
      await edit(sock, chat, status, `❌ *YTV failed:* ${e.message}`);
      await react(sock, chat, msg, '❌');
    } finally {
      cleanPrefix(filePrefix, outputDir);
      if (global.gc) { try { global.gc(); } catch {} }
    }
  });
}

export const videoCommand = ytvCommand;

export async function ytdlCommand(sock, chat, msg, args) {
  const url = (args || []).join(' ').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return sendWithCta(sock, chat, '📥 *Usage:* `.ytdl <YouTube URL>`', { quoted: msg });
  }

  return queue.add(async () => {
    cleanOldTmpFiles();
    const status = await sock.sendMessage(chat, { text: `📥 *Downloading:* ${url}` }, { quoted: msg });

    const filePrefix = `ytdl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();
    const outputTemplate = path.join(outputDir, `${filePrefix}_%(title).50s.%(ext)s`);

    try {
      await edit(sock, chat, status, `📥 *Processing YouTube link…*`);

      const downloadedPath = await runYtdlp(url, outputDir, filePrefix, (dl) =>
        dl.addArgs('-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outputTemplate));


      try {
        const info = await probe(downloadedPath);
        if (!info.video) throw new Error('Downloaded file has no video track (yt-dlp could not merge video+audio — ffmpeg problem)');
      } catch (pe) {
        if (/no video track/.test(pe.message)) throw pe;
      }

      await edit(sock, chat, status, `📥 *Optimizing video for WhatsApp playability…*`);
      const convertedPath = path.join(outputDir, `${filePrefix}_playable.mp4`);
      const finalVideoPath = await ensurePlayable(downloadedPath, convertedPath);

      const stat = fs.statSync(finalVideoPath);
      if (stat.size > MAX_VIDEO_BYTES) {
        throw new Error(`Downloaded file size (${(stat.size / (1024 * 1024)).toFixed(1)} MB) exceeds 400 MB cap limit`);
      }

      await edit(sock, chat, status, `📥 *Sending media (${(stat.size / (1024 * 1024)).toFixed(1)} MB)…*`);
      const fileName = path.basename(finalVideoPath);
      let videoBuffer = fs.readFileSync(finalVideoPath);

      await sock.sendMessage(chat, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        fileName: fileName,
        caption: `📥 *YouTube Download*\nSize: ${(stat.size / (1024 * 1024)).toFixed(1)} MB\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`,
      }, { quoted: msg });
      videoBuffer = null;

      await edit(sock, chat, status, `✅ *Download complete*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`);
      await react(sock, chat, msg, '☑');
    } catch (e) {
      console.error('[ytdlCommand]', e);
      await edit(sock, chat, status, `❌ *YTDL failed:* ${e.message}`);
      await react(sock, chat, msg, '❌');
    } finally {
      cleanPrefix(filePrefix, outputDir);
      if (global.gc) { try { global.gc(); } catch {} }
    }
  });
}
