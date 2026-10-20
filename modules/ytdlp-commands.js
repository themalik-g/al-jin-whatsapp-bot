// ─────────────────────────────────────────────
// Al-Jin · modules/ytdlp-commands.js
// .play, .ytv, .ytdl commands via ytdlp-nodejs
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import { getTmpDir, runYtdlp, cleanPrefix, cleanOldTmpFiles, getVideoInfo, summarizeVideoFormats } from '../lib/ytdlp.js';
import { sendWithCta, sendInteractive, createQuickReply } from '../lib/buttons.js';
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
    // Don't make the download wait for WhatsApp round-trips: the status message + reaction go out while yt-dlp already runs.
    reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
    const statusP = sock.sendMessage(chat, { text: `🔍 *Searching:* ${query}` }, { quoted: msg }).catch(() => null);
    let status = null; statusP.then((s) => { status = s; });
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
          reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
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

      await statusP;
      reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
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
      await statusP;
      await editStatus(sock, chat, status, `❌ *Play failed:* ${capHint(e)}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      cleanPrefix(filePrefix, outputDir);
    }
  });
}

// One shared video pipeline for .ytv / .video / .ytdl
async function videoJob(sock, chat, msg, { target, tag, icon, label, height = null }) {
  return queue.add(async () => {
    cleanOldTmpFiles();
    reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
    const statusP = sock.sendMessage(chat, { text: `${icon} Downloading 0% done...` }, { quoted: msg }).catch(() => null);
    let status = null; statusP.then((s) => { status = s; });
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
        dl.addArgs('-f', height ? videoFormat(height) : videoFormat(), '--merge-output-format', 'mp4',
          '--postprocessor-args', 'Merger+ffmpeg:-movflags +faststart', '-o', outputTemplate), onProgress);

      // Converts only if the file isn't already WhatsApp-compatible.
      const finalPath = await ensurePlayable(downloaded, path.join(outputDir, `${filePrefix}_playable.mp4`));
      const size = fs.statSync(finalPath).size;
      if (size > getMaxDownloadBytes()) throw new Error(`Video (${MB(size)} MB) exceeds the ${getMaxDownloadMB()} MB cap — raise it with .dlcap`);

      await statusP;
      reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending`);

      // Final safety net: if it still isn't WhatsApp-playable, send as a document so it never arrives broken.
      // Large videos go out as documents: WhatsApp handles those reliably up to 2 GB.
      const playable = size <= getDocThresholdBytes() && await isPlayable(finalPath).catch(() => false);
      const caption = `${icon} *${label}${height ? ` · ${height}p` : ''}*\nSize: ${MB(size)} MB\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
      if (playable) {
        await sock.sendMessage(chat, { video: { url: finalPath }, mimetype: 'video/mp4', fileName: path.basename(finalPath), caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { document: { url: finalPath }, mimetype: 'video/mp4', fileName: path.basename(finalPath), caption }, { quoted: msg });
      }

      await editStatus(sock, chat, status, `✅ *Sent (${MB(size)} MB)*\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error(`[${tag}]`, e);
      await statusP;
      await editStatus(sock, chat, status, `❌ *${label} failed:* ${capHint(e)}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      cleanPrefix(filePrefix, outputDir);
    }
  });
}

// ── choose the quality ───────────────────────────────────────────────────────────────────────
// Before downloading, ask yt-dlp which qualities the video really has and let the user pick one
// (as a list / numbered text / poll / buttons — whatever .replymode is). If the qualities can't be read, or
// there is only one, the video is downloaded straight away at the default quality like before.
// A pick comes back as  .ytv -q720 <url>  (the choice id), which downloads exactly that quality.
const fmtDur = (s) => { s = Math.round(Number(s) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

function splitQualityFlag(args = []) {
  const list = [...(args || [])];
  let height = null;
  if (list.length && /^-q(\d{3,4})p?$/i.test(list[0])) height = Number(list.shift().match(/(\d{3,4})/)[1]);
  return { height, rest: list };
}

async function offerQualities(sock, chat, msg, { target, cmd, icon, label }) {
  reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
  let sum = null;
  try { sum = summarizeVideoFormats(await getVideoInfo(target), { maxBytes: getMaxDownloadBytes() }); } catch { sum = null; }
  if (!sum || sum.options.length < 2 || !/^https?:\/\//i.test(sum.url)) return false;   // nothing to choose → plain download

  const buttons = sum.options.map((o) => {
    const size = o.size ? ` · ${MB(o.size)} MB` : '';
    const note = o.h264 ? '' : ' (converts)';
    return createQuickReply(`${o.height}p${o.fps > 30 ? o.fps : ''}${size}${note}`, `${cmd} -q${o.height} ${sum.url}`);
  });
  const body = `${icon} *${sum.title || label}*\n${sum.uploader ? `👤 ${sum.uploader}  ` : ''}${sum.duration ? `⏱️ ${fmtDur(sum.duration)}` : ''}\n\nChoose the quality to download:`;
  await sendInteractive(sock, chat, { body, footer: 'Al-Jin', buttons }, { quoted: msg });
  return true;
}

export async function ytvCommand(sock, chat, msg, args) {
  const { height, rest } = splitQualityFlag(args);
  const query = rest.join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎬 *Usage:* `.ytv <video title or url>` or `.video <video title or url>`', { quoted: msg });
  }
  const target = resolveTarget(query);
  if (!height && await offerQualities(sock, chat, msg, { target, cmd: 'ytv', icon: '🎬', label: 'YouTube Video' })) return;
  return videoJob(sock, chat, msg, { target, tag: 'ytv', icon: '🎬', label: 'YouTube Video', height });
}

export const videoCommand = ytvCommand;

export async function ytdlCommand(sock, chat, msg, args) {
  const { height, rest } = splitQualityFlag(args);
  const url = rest.join(' ').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return sendWithCta(sock, chat, '📥 *Usage:* `.ytdl <YouTube URL>`', { quoted: msg });
  }
  if (!height && await offerQualities(sock, chat, msg, { target: url, cmd: 'ytdl', icon: '📥', label: 'YouTube Download' })) return;
  return videoJob(sock, chat, msg, { target: url, tag: 'ytdl', icon: '📥', label: 'YouTube Download', height });
}
