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
import { getMaxDownloadMB, getMaxDownloadBytes, getDocThresholdBytes, videoFormat, fmtMB } from '../core/limits.js';

const queue = new PQueue({ concurrency: 2 });
// Size cap is no longer hard-coded: change it live with  .dlcap 1gb  (see core/limits.js)
const capHint = (e) => /no file was created|max-filesize|larger than/i.test(String(e?.message || e))
  ? `${e.message}\n\n_It may be bigger than the ${getMaxDownloadMB()} MB cap — raise it with \`.dlcap 1gb\`._`
  : e.message;

function resolveTarget(input) {
  const isUrl = /^https?:\/\//i.test(input);
  return isUrl ? input : `ytsearch1:${input}`;
}

// Video format comes from core/limits.js (H.264+AAC first, max height set with  .dlcap quality 720 ).
const AUDIO_FORMAT = 'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b';
const MB = fmtMB;

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
      if (size > getMaxDownloadBytes()) throw new Error(`Audio (${MB(size)} MB) exceeds the ${getMaxDownloadMB()} MB cap — raise it with .dlcap`);

      await reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending`);

      if (size > getDocThresholdBytes()) {
        // very long audio (podcasts, mixes): a document uploads/downloads far more reliably
        await sock.sendMessage(chat, {
          document: { url: audio.path },
          mimetype: audio.mimetype,
          fileName: path.basename(audio.path),
        }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, {
          audio: { url: audio.path },   // streamed from disk, not loaded into RAM
          mimetype: audio.mimetype,
          fileName: path.basename(audio.path),
          ptt: false,
        }, { quoted: msg });
      }

      await editStatus(sock, chat, status, `✅ *Audio sent*\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error('[playCommand]', e);
      await editStatus(sock, chat, status, `❌ *Play failed:* ${capHint(e)}`);
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
        dl.addArgs('-f', videoFormat(), '--merge-output-format', 'mp4',
          '--postprocessor-args', 'Merger+ffmpeg:-movflags +faststart', '-o', outputTemplate), onProgress);

      // Converts only if the file isn't already WhatsApp-compatible.
      const finalPath = await ensurePlayable(downloaded, path.join(outputDir, `${filePrefix}_playable.mp4`));
      const size = fs.statSync(finalPath).size;
      if (size > getMaxDownloadBytes()) throw new Error(`Video (${MB(size)} MB) exceeds the ${getMaxDownloadMB()} MB cap — raise it with .dlcap`);

      await reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending`);

      // Final safety net: if it still isn't WhatsApp-playable, send as a document so it never arrives broken.
      // Large videos go out as documents: WhatsApp handles those reliably up to 2 GB.
      const playable = size <= getDocThresholdBytes() && await isPlayable(finalPath).catch(() => false);
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
      await editStatus(sock, chat, status, `❌ *${label} failed:* ${capHint(e)}`);
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
