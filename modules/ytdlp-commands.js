// ─────────────────────────────────────────────
// Al-Jin · modules/ytdlp-commands.js
// .play, .yta, .ytv / .video / .yt, .ytdl
//
//   .play <song | url>   direct download (no questions).
//   .yta  <song | url>   top 5 results to pick from → audio qualities to pick from → download.
//   .ytv  <title | url>  top 5 results to pick from → video qualities to pick from → download.
//   .ytdl <url>          video qualities to pick from → download.
//
// Every download goes through lib/yt-chain.js: yt-dlp → ESM downloader → backup API, and .play ends with
// SoundCloud and the Spotify downloader. The picks are shown the way .replymode says (list / text / poll /
// buttons); a pick comes back as  .ytv <url>  /  .ytv -q720 <url>  /  .yta -a128 <url>  (the choice ids).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import { getTmpDir, cleanPrefix, cleanOldTmpFiles, getVideoInfo, summarizeVideoFormats, summarizeAudioFormats } from '../lib/ytdlp.js';
import { sendWithCta, sendInteractive, createQuickReply, createSingleSelect } from '../lib/buttons.js';
import { ensurePlayable, ensureAudio, isPlayable } from '../lib/video-converter.js';
import { reactMsg, editStatus, EMOJIS } from '../lib/reaction-helper.js';
import { getMaxDownloadMB, getMaxDownloadBytes, getDocThresholdBytes, fmtMB } from '../core/limits.js';
import { firstWorking, urlResolver, videoSources, audioSources } from '../lib/yt-chain.js';
import { ytSearch } from '../lib/ytsearch.js';

const queue = new PQueue({ concurrency: 2 });
// Size cap is no longer hard-coded: change it live with  .dlcap 1gb  (see core/limits.js)
const capHint = (e) => /no file was created|max-filesize|larger than/i.test(String(e?.message || e))
  ? `${e.message}\n\n_It may be bigger than the ${getMaxDownloadMB()} MB cap — raise it with \`.dlcap 1gb\`._`
  : e.message;

const MB = fmtMB;
const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));
const viaNote = (via) => (!via || via === 'yt-dlp' ? '' : ` _(via ${via})_`);
const fmtDur = (s) => { s = Math.round(Number(s) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

// "-q720" = video height, "-a128" = audio bitrate — these come from the ids of the picks.
function splitFlags(args = []) {
  const list = [...(args || [])];
  let height = null, abr = null;
  while (list.length) {
    const q = /^-q(\d{3,4})p?$/i.exec(list[0]);
    const a = /^-a(\d{2,3})$/i.exec(list[0]);
    if (q) { height = Number(q[1]); list.shift(); } else if (a) { abr = Number(a[1]); list.shift(); } else break;
  }
  return { height, abr, rest: list };
}

// ── audio: .play and .yta ────────────────────────────────────────────────────────────────────
async function audioJob(sock, chat, msg, { query = '', url = null, abr = null, tag, spotify = false }) {
  return queue.add(async () => {
    cleanOldTmpFiles();
    // Don't make the download wait for WhatsApp round-trips: the status message + reaction go out while yt-dlp already runs.
    reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
    const statusP = sock.sendMessage(chat, { text: url ? '📥 Downloading 0% done...' : `🔍 *Searching:* ${query}` }, { quoted: msg }).catch(() => null);
    let status = null; statusP.then((s) => { status = s; });
    const filePrefix = `${tag}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();

    try {
      let lastPercent = -1;
      const onProgress = async (percent) => {
        if (percent - lastPercent >= 10 || percent === 100) {
          lastPercent = percent;
          await editStatus(sock, chat, status, `📥 Downloading ${percent}% done...`);
        }
      };

      let got = null, firstErr = null;
      try {
        reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
        got = await firstWorking(audioSources({
          target: url || `ytsearch1:${query}`, resolve: urlResolver({ url, query }), dir: outputDir, prefix: filePrefix,
          abr, soundcloudQuery: url ? null : query, onProgress,
        }), { onTry: (name, i) => { if (i > 0) editStatus(sock, chat, status, `🔁 *Trying ${name}…*`); } });
      } catch (e) { firstErr = e; }

      // .play only: the Spotify downloader is the last resort for a song title
      if (!got && spotify && !url) {
        await statusP;
        await editStatus(sock, chat, status, '🎧 *Trying Spotify…*');
        try {
          const { spotifyDownload } = await import('./x-music.js');
          if (await spotifyDownload(sock, chat, msg, query)) {
            await editStatus(sock, chat, status, `✅ *Audio sent* _(via Spotify)_\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
            await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
            return;
          }
        } catch (e) { console.error('[spotify fallback]', e?.message || e); }
      }
      if (!got) throw firstErr || new Error('No audio file created');

      const audio = await ensureAudio(got.file, path.join(outputDir, `${filePrefix}_conv`));
      const size = fs.statSync(audio.path).size;
      if (size > getMaxDownloadBytes()) throw new Error(`Audio (${MB(size)} MB) exceeds the ${getMaxDownloadMB()} MB cap — raise it with .dlcap`);

      await statusP;
      reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending${viaNote(got.via)}`);

      if (size > getDocThresholdBytes()) {
        // very long audio (podcasts, mixes): a document uploads/downloads far more reliably
        await sock.sendMessage(chat, { document: { url: audio.path }, mimetype: audio.mimetype, fileName: path.basename(audio.path) }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, {
          audio: { url: audio.path },   // streamed from disk, not loaded into RAM
          mimetype: audio.mimetype,
          fileName: path.basename(audio.path),
          ptt: false,
        }, { quoted: msg });
      }

      await editStatus(sock, chat, status, `✅ *Audio sent*${viaNote(got.via)}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error(`[${tag}]`, e);
      await statusP;
      await editStatus(sock, chat, status, `❌ *${tag === 'play' ? 'Play' : 'Audio'} failed:* ${capHint(e)}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      cleanPrefix(filePrefix, outputDir);
    }
  });
}

export async function playCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎵 *Usage:* `.play <song name or url>`', { quoted: msg });
  }
  return audioJob(sock, chat, msg, { query, url: isUrl(query) ? query : null, tag: 'play', spotify: true });
}

// ── video: .ytv / .video / .yt / .ytdl ────────────────────────────────────────────────────────
// One shared video pipeline.
async function videoJob(sock, chat, msg, { target, url = null, query = '', tag, icon, label, height = null }) {
  return queue.add(async () => {
    cleanOldTmpFiles();
    reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
    const statusP = sock.sendMessage(chat, { text: `${icon} Downloading 0% done...` }, { quoted: msg }).catch(() => null);
    let status = null; statusP.then((s) => { status = s; });
    const filePrefix = `${tag}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputDir = getTmpDir();

    try {
      let lastPercent = -1;
      const onProgress = async (percent) => {
        if (percent - lastPercent >= 10 || percent === 100) {
          lastPercent = percent;
          await editStatus(sock, chat, status, `Downloading ${percent}% done...`);
        }
      };

      const got = await firstWorking(
        videoSources({ target, resolve: urlResolver({ url: url || (isUrl(target) ? target : null), query }), dir: outputDir, prefix: filePrefix, height, onProgress }),
        { onTry: (name, i) => { if (i > 0) editStatus(sock, chat, status, `🔁 *Trying ${name}…*`); } },
      );

      // Converts only if the file isn't already WhatsApp-compatible.
      const finalPath = await ensurePlayable(got.file, path.join(outputDir, `${filePrefix}_playable.mp4`));
      const size = fs.statSync(finalPath).size;
      if (size > getMaxDownloadBytes()) throw new Error(`Video (${MB(size)} MB) exceeds the ${getMaxDownloadMB()} MB cap — raise it with .dlcap`);

      await statusP;
      reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `Downloading complete ✅ now sending${viaNote(got.via)}`);

      // Final safety net: if it still isn't WhatsApp-playable, send as a document so it never arrives broken.
      // Large videos go out as documents: WhatsApp handles those reliably up to 2 GB.
      const playable = size <= getDocThresholdBytes() && await isPlayable(finalPath).catch(() => false);
      const quality = height && got.via === 'yt-dlp' ? ` · ${height}p` : got.quality ? ` · ${got.quality}p` : '';
      const caption = `${icon} *${got.title || label}${quality}*\nSize: ${MB(size)} MB\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
      if (playable) {
        await sock.sendMessage(chat, { video: { url: finalPath }, mimetype: 'video/mp4', fileName: path.basename(finalPath), caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { document: { url: finalPath }, mimetype: 'video/mp4', fileName: path.basename(finalPath), caption }, { quoted: msg });
      }

      await editStatus(sock, chat, status, `✅ *Sent (${MB(size)} MB)*${viaNote(got.via)}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
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

// ── the picks ─────────────────────────────────────────────────────────────────────────────────
// Top 5 search results. A pick comes back as  .ytv <url>  /  .yta <url>.
async function offerSearch(sock, chat, msg, { query, cmd, icon }) {
  reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
  let results = [];
  try { results = (await ytSearch(query, 5)) || []; } catch (e) { console.error('[search]', e?.message || e); return false; }
  results = results.filter((r) => /^https?:\/\//i.test(r.url || '')).slice(0, 5);
  if (!results.length) return false;
  const rows = results.map((r) => ({
    title: String(r.title || 'Video').trim(),
    description: [r.channel, r.duration].filter(Boolean).join(' · '),
    id: `${cmd} ${r.url}`,
  }));
  const body = `${icon} *Top ${rows.length} results for:* ${query}\n\nChoose one:`;
  await sendInteractive(sock, chat, { body, footer: 'Al-Jin', buttons: [createSingleSelect('Select', [{ title: 'Results', rows }])] }, { quoted: msg });
  return true;
}

// Video qualities the video really has. Returns false when there is nothing to choose (→ plain download).
async function offerQualities(sock, chat, msg, { target, cmd, icon, label }) {
  reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
  let sum = null;
  try { sum = summarizeVideoFormats(await getVideoInfo(target), { maxBytes: getMaxDownloadBytes() }); } catch { sum = null; }
  if (!sum || sum.options.length < 2 || !/^https?:\/\//i.test(sum.url)) return false;

  const buttons = sum.options.map((o) => {
    const size = o.size ? ` · ${MB(o.size)} MB` : '';
    const note = o.h264 ? '' : ' (converts)';
    return createQuickReply(`${o.height}p${o.fps > 30 ? o.fps : ''}${size}${note}`, `${cmd} -q${o.height} ${sum.url}`);
  });
  const body = `${icon} *${sum.title || label}*\n${sum.uploader ? `👤 ${sum.uploader}  ` : ''}${sum.duration ? `⏱️ ${fmtDur(sum.duration)}` : ''}\n\nChoose the quality to download:`;
  await sendInteractive(sock, chat, { body, footer: 'Al-Jin', buttons }, { quoted: msg });
  return true;
}

// Audio qualities (bitrate tiers) the video really has.
async function offerAudioQualities(sock, chat, msg, { target, cmd, icon, label }) {
  reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
  let sum = null;
  try { sum = summarizeAudioFormats(await getVideoInfo(target), { maxBytes: getMaxDownloadBytes() }); } catch { sum = null; }
  if (!sum || sum.options.length < 2 || !/^https?:\/\//i.test(sum.url)) return false;

  const buttons = sum.options.map((o) => createQuickReply(
    `${o.label} · ${o.abr} kbps${o.size ? ` · ${MB(o.size)} MB` : ''}`, `${cmd} -a${o.abr} ${sum.url}`));
  const body = `${icon} *${sum.title || label}*\n${sum.uploader ? `👤 ${sum.uploader}  ` : ''}${sum.duration ? `⏱️ ${fmtDur(sum.duration)}` : ''}\n\nChoose the audio quality:`;
  await sendInteractive(sock, chat, { body, footer: 'Al-Jin', buttons }, { quoted: msg });
  return true;
}

// ── commands ──────────────────────────────────────────────────────────────────────────────────
export async function ytvCommand(sock, chat, msg, args) {
  const { height, rest } = splitFlags(args);
  const query = rest.join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎬 *Usage:* `.ytv <video title or url>` or `.video <video title or url>`', { quoted: msg });
  }
  const url = isUrl(query) ? query : null;
  // a title, not a link → show the top 5 results first
  if (!url && !height && await offerSearch(sock, chat, msg, { query, cmd: 'ytv', icon: '🎬' })) return;
  const target = url || `ytsearch1:${query}`;
  if (!height && await offerQualities(sock, chat, msg, { target, cmd: 'ytv', icon: '🎬', label: 'YouTube Video' })) return;
  return videoJob(sock, chat, msg, { target, url, query, tag: 'ytv', icon: '🎬', label: 'YouTube Video', height });
}

export const videoCommand = ytvCommand;

export async function ytaCommand(sock, chat, msg, args) {
  const { abr, rest } = splitFlags(args);
  const query = rest.join(' ').trim();
  if (!query) {
    return sendWithCta(sock, chat, '🎵 *Usage:* `.yta <song title or url>`', { quoted: msg });
  }
  const url = isUrl(query) ? query : null;
  if (!url && !abr && await offerSearch(sock, chat, msg, { query, cmd: 'yta', icon: '🎵' })) return;
  const target = url || `ytsearch1:${query}`;
  if (!abr && await offerAudioQualities(sock, chat, msg, { target, cmd: 'yta', icon: '🎵', label: 'YouTube Audio' })) return;
  return audioJob(sock, chat, msg, { query, url, abr, tag: 'yta' });
}

export async function ytdlCommand(sock, chat, msg, args) {
  const { height, rest } = splitFlags(args);
  const url = rest.join(' ').trim();
  if (!url || !isUrl(url)) {
    return sendWithCta(sock, chat, '📥 *Usage:* `.ytdl <YouTube URL>`', { quoted: msg });
  }
  if (!height && await offerQualities(sock, chat, msg, { target: url, cmd: 'ytdl', icon: '📥', label: 'YouTube Download' })) return;
  return videoJob(sock, chat, msg, { target: url, url, tag: 'ytdl', icon: '📥', label: 'YouTube Download', height });
}
