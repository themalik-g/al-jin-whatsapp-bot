// ─────────────────────────────────────────────
// Al-Jin · modules/ytdlp-commands.js
// .play, .ytv, .ytdl commands via ytdlp-nodejs
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import { getTmpDir, runYtdlp, cleanPrefix, cleanOldTmpFiles } from '../lib/ytdlp.js';
import { sendWithCta } from '../lib/buttons.js';
import { ensurePlayable, ensureAudio, isPlayable } from '../lib/video-converter.js';
import { reactMsg, editStatus, EMOJIS } from '../lib/reaction-helper.js';

const queue = new PQueue({ concurrency: 2 });
const MAX_VIDEO_BYTES = 400 * 1024 * 1024; // 400 MB cap
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;  // 50 MB cap for WhatsApp audio

function resolveTarget(input) {
  const isUrl = /^https?:\/\//i.test(input);
  return isUrl ? input : `ytsearch1:${input}`;
}

// Prefer streams WhatsApp plays natively (H.264 + AAC) so yt-dlp only has to copy-merge,
// no re-encode. Falls back to anything ≤480p; ensurePlayable converts only if required.
const VIDEO_FORMAT = 'bv*[vcodec^=avc1][height<=480]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a][height<=480]/bv*[height<=480]+ba/b[height<=480]/b';
const AUDIO_FORMAT = 'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b';
const MB = (n) => (n / (1024 * 1024)).toFixed(1);

export async function playCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎵 *Usage:* `.play <song name or url>`', { quoted: msg });
  }

  return queue.add(async () => {
    cleanOldTmpFiles();
    await reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
    const status = await sock.sendMessage(chat, { text: `🔍 *Searching:* ${query}` }, { quoted: msg });
    const filePrefix = `play_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();
    const outputTemplate = path.join(outputDir, `${filePrefix}_%(title).50s.%(ext)s`);

    try {
      const isUrl = /^https?:\/\//i.test(query);
      const targets = isUrl ? [query] : [`ytsearch1:${query}`, `scsearch1:${query}`];
      let downloaded = null, lastErr = null;

      let lastPercent = -1;
      const onProgress = async (percent) => {
        if (percent - lastPercent >= 10 || percent === 100) {
          lastPercent = percent;
          await editStatus(sock, chat, status, `📥 Downloading ${percent}% done...`);
        }
      };

      for (const target of targets) {
        try {
          await reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
          // Native m4a/aac audio — no mp3 re-encode.
          downloaded = await runYtdlp(target, outputDir, filePrefix, (dl) =>
            dl.addArgs('-f', AUDIO_FORMAT, '-o', outputTemplate), onProgress);
          break;
        } catch (err) {
          lastErr = err;
          if (target.startsWith('ytsearch1:')) await editStatus(sock, chat, status, '🎵 *YouTube failed; trying SoundCloud…*');
        }
      }
      if (!downloaded || !fs.existsSync(downloaded)) throw lastErr || new Error('No audio file created');

      const audio = await ensureAudio(downloaded, path.join(outputDir, `${filePrefix}_conv`));
      const size = fs.statSync(audio.path).size;
      if (size > MAX_AUDIO_BYTES) throw new Error(`Audio (${MB(size)} MB) exceeds the 50 MB limit`);

      await reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending`);

      await sock.sendMessage(chat, {
        audio: { url: audio.path },   // streamed from disk, not loaded into RAM
        mimetype: audio.mimetype,
        fileName: path.basename(audio.path),
        ptt: false,
      }, { quoted: msg });

      await editStatus(sock, chat, status, `✅ *Audio sent*\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error('[playCommand]', e);
      await editStatus(sock, chat, status, `❌ *Play failed:* ${e.message}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      cleanPrefix(filePrefix, outputDir);
    }
  });
}

// One shared video pipeline for .ytv / .video / .ytdl
async function videoJob(sock, chat, msg, { target, tag, icon, label }) {
  return queue.add(async () => {
    cleanOldTmpFiles();
    await reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
    const status = await sock.sendMessage(chat, { text: `${icon} Downloading 0% done...` }, { quoted: msg });
    const filePrefix = `${tag}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();
    const outputTemplate = path.join(outputDir, `${filePrefix}_%(title).50s.%(ext)s`);

    try {
      let lastPercent = -1;
      const onProgress = async (percent) => {
        if (percent - lastPercent >= 10 || percent === 100) {
          lastPercent = percent;
          await editStatus(sock, chat, status, `Downloading ${percent}% done...`);
        }
      };

      const downloaded = await runYtdlp(target, outputDir, filePrefix, (dl) =>
        dl.addArgs('-f', VIDEO_FORMAT, '--merge-output-format', 'mp4',
          '--postprocessor-args', 'Merger+ffmpeg:-movflags +faststart', '-o', outputTemplate), onProgress);

      // Converts only if the file isn't already WhatsApp-compatible.
      const finalPath = await ensurePlayable(downloaded, path.join(outputDir, `${filePrefix}_playable.mp4`));
      const size = fs.statSync(finalPath).size;
      if (size > MAX_VIDEO_BYTES) throw new Error(`Video (${MB(size)} MB) exceeds the 400 MB cap`);

      await reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending`);

      // Final safety net: if it still isn't WhatsApp-playable, send as a document so it never arrives broken.
      const playable = await isPlayable(finalPath).catch(() => false);
      const caption = `${icon} *${label}*\nSize: ${MB(size)} MB\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
      if (playable) {
        await sock.sendMessage(chat, { video: { url: finalPath }, mimetype: 'video/mp4', fileName: path.basename(finalPath), caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { document: { url: finalPath }, mimetype: 'video/mp4', fileName: path.basename(finalPath), caption }, { quoted: msg });
      }

      await editStatus(sock, chat, status, `✅ *Sent (${MB(size)} MB)*\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error(`[${tag}]`, e);
      await editStatus(sock, chat, status, `❌ *${label} failed:* ${e.message}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      cleanPrefix(filePrefix, outputDir);
    }
  });
}

export async function ytvCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎬 *Usage:* `.ytv <video title or url>` or `.video <video title or url>`', { quoted: msg });
  }
  return videoJob(sock, chat, msg, { target: resolveTarget(query), tag: 'ytv', icon: '🎬', label: 'YouTube Video' });
}

export const videoCommand = ytvCommand;

export async function ytdlCommand(sock, chat, msg, args) {
  const url = (args || []).join(' ').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return sendWithCta(sock, chat, '📥 *Usage:* `.ytdl <YouTube URL>`', { quoted: msg });
  }
  return videoJob(sock, chat, msg, { target: url, tag: 'ytdl', icon: '📥', label: 'YouTube Download' });
}
