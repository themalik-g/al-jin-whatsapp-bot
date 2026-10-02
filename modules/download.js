// ─────────────────────────────────────────────
// Al-Jin · modules/download.js
// Platform downloaders — ytdlp-nodejs + @postfetch/core
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import PQueue from 'p-queue';
import { ffmpegPath } from '../lib/ffmpeg-resolver.js';
import { fileTypeFromBuffer } from 'file-type';
import { postfetch, download as pfDownload, archive as pfArchive, detect as pfDetect } from '@postfetch/core';
import { sendInteractive, createQuickReply, sendWithCta } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';
import { getTmpDir, runYtdlp, cleanPrefix, cleanOldTmpFiles } from '../lib/ytdlp.js';

const MAX_BYTES       = 15 * 1024 * 1024;
const MAX_VIDEO       = 60 * 1024 * 1024;
const YTDLP_TIMEOUT   = 120_000;
const CONVERT_TIMEOUT = 60_000;
const ITEM_DL_TIMEOUT  = 90_000;   // per post item download
const ITEM_GAP_MS      = 700;      // pause between sends (avoids WA throttling)
const queue = new PQueue({ concurrency: 1 });

// ── ytdlp-nodejs supported-host whitelist ──
const YTDLP_SUPPORTED_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
  'vimeo.com', 'www.vimeo.com',
  'dailymotion.com', 'www.dailymotion.com', 'dai.ly',
  'twitch.tv', 'www.twitch.tv',
  'streamable.com', 'www.streamable.com',
  'bilibili.com', 'www.bilibili.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  'instagram.com', 'www.instagram.com', 'instagr.am',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'fb.watch',
  'reddit.com', 'www.reddit.com', 'redd.it',
  'pinterest.com', 'www.pinterest.com', 'pin.it',
  'threads.net', 'www.threads.net',
  'tumblr.com', 'www.tumblr.com',
  'linkedin.com', 'www.linkedin.com',
  'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com',
  'imgur.com', 'www.imgur.com',
  '9gag.com', 'www.9gag.com',
]);

function isYtDlpSupportedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (YTDLP_SUPPORTED_HOSTS.has(host)) return true;
    for (const supported of YTDLP_SUPPORTED_HOSTS) {
      if (host.endsWith('.' + supported)) return true;
    }
    return false;
  } catch { return false; }
}

async function react(sock, chat, msg, emoji) {
  try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {}
}
async function edit(sock, chat, key, text) {
  try { await sock.sendMessage(chat, { text, edit: key.key }); } catch {}
}
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms/1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function cleanFile(p) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {} }

export function isPostUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (
    lower.includes('instagram.com/p/') || lower.includes('instagram.com/reel/') || lower.includes('instagram.com/tv/') ||
    (lower.includes('tiktok.com/') && lower.includes('/photo/')) ||
    (lower.includes('tiktok.com/') && lower.includes('/video/')) ||
    (lower.includes('facebook.com/') && (lower.includes('/posts/') || lower.includes('/photos/') || lower.includes('/videos/'))) ||
    lower.includes('fb.watch/') ||
    (lower.includes('twitter.com/') && lower.includes('/status/')) ||
    (lower.includes('x.com/') && lower.includes('/status/')) ||
    lower.includes('threads.net/') ||
    lower.includes('reddit.com/') ||
    lower.includes('pinterest.com/pin/') ||
    lower.includes('pin.it/')
  ) return true;
  try { return !!pfDetect(url); } catch { return false; }
}

function bufferToMp3(inputBuffer, bitrate = 192) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg missing'));
    if (!inputBuffer || inputBuffer.length < 1024) return reject(new Error('input too small'));
    let ff;
    try {
      ff = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        '-i', 'pipe:0', '-vn',
        '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`,
        '-f', 'mp3', 'pipe:1',
      ]);
    } catch (e) { return reject(new Error(`ffmpeg spawn failed: ${e.message}`)); }

    const chunks = []; let err = ''; let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', (e) => done(reject, new Error(`ffmpeg spawn: ${e.message}`)));
    ff.on('close', (code) => {
      if (code !== 0) return done(reject, new Error(`ffmpeg ${code}: ${err.slice(-200)}`));
      const out = Buffer.concat(chunks);
      if (out.length < 1024) return done(reject, new Error('ffmpeg produced empty mp3'));
      done(resolve, out);
    });
    ff.stdin.on('error', () => {});
    try { ff.stdin.write(inputBuffer); ff.stdin.end(); }
    catch (e) { done(reject, new Error(`ffmpeg stdin failed: ${e.message}`)); }
  });
}

async function classifyBuffer(buffer) {
  const ft = await fileTypeFromBuffer(buffer).catch(() => null);
  if (!ft) return { kind: 'unknown', ext: 'bin', mime: 'application/octet-stream' };
  if (ft.mime.startsWith('audio/')) return { kind: 'audio', ext: ft.ext, mime: ft.mime };
  if (ft.mime.startsWith('video/')) return { kind: 'video', ext: ft.ext, mime: ft.mime };
  if (ft.mime.startsWith('image/')) return { kind: 'image', ext: ft.ext, mime: ft.mime };
  return { kind: 'unknown', ext: ft.ext, mime: ft.mime };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sniffImage(b) {
  return (b[0] === 0xff && b[1] === 0xd8) ||
    (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
    (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) ||
    (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46);
}

// Sends ONE post item exactly like the old working build (raw buffer, no disk).
// Never throws → returns { ok, reason }.
async function sendPostfetchItem(sock, chat, msg, buffer, item, idx) {
  try {
    let type = await classifyBuffer(buffer);
    const itemKind = item.kind || item.type;
    if (type.kind === 'unknown' && itemKind) {
      if (itemKind === 'image') type = { kind: 'image', ext: 'jpg', mime: item.mime || 'image/jpeg' };
      else if (itemKind === 'video') type = { kind: 'video', ext: 'mp4', mime: item.mime || 'video/mp4' };
      else if (itemKind === 'audio') type = { kind: 'audio', ext: 'mp3', mime: item.mime || 'audio/mpeg' };
    }
    const safeName = item.filename || `media_${idx + 1}.${type.ext || 'jpg'}`;
    const isImage = type.kind === 'image' || itemKind === 'image' || (item.mime?.startsWith('image/'));
    const isVideo = type.kind === 'video' || itemKind === 'video' || (item.mime?.startsWith('video/'));
    const isAudio = type.kind === 'audio' || itemKind === 'audio' || (item.mime?.startsWith('audio/'));
    const limit = isVideo ? MAX_VIDEO : MAX_BYTES;
    if (buffer.length > limit) {
      return { ok: false, reason: `too large (${(buffer.length / 1048576).toFixed(1)} MB)` };
    }

    let content;
    if (isImage) content = { image: buffer, mimetype: type.mime || item.mime || 'image/jpeg' };
    else if (isVideo) content = { video: buffer, mimetype: type.mime || item.mime || 'video/mp4', fileName: safeName };
    else if (isAudio) content = { audio: buffer, mimetype: type.mime || item.mime || 'audio/mpeg', fileName: safeName, ptt: false };
    else if (sniffImage(buffer)) content = { image: buffer, mimetype: type.mime || item.mime || 'image/jpeg' };
    else content = { document: buffer, mimetype: type.mime || item.mime || 'application/octet-stream', fileName: safeName };

    await sock.sendMessage(chat, content, { quoted: msg });
    return { ok: true };
  } catch (e) {
    console.warn(`[sendPostfetchItem ${idx + 1}]`, e.message);
    return { ok: false, reason: e.message };
  }
}

// Download + send every item of a post, one by one, with honest progress and result.
async function deliverPostItems(sock, chat, msg, status, items) {
  const total = Math.min(items.length, 20);
  let sent = 0;
  const failed = [];
  {
    for (let i = 0; i < total; i++) {
      const item = items[i];
      await edit(sock, chat, status, `⬇️ *Downloading ${i + 1}/${total}…*`);
      let buffer;
      try {
        const res = await withTimeout(pfDownload(item), ITEM_DL_TIMEOUT, `item ${i + 1}`);
        if (res && typeof res.ok === 'boolean' && !res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        console.warn(`[postfetch item ${i + 1}] download:`, e.message);
        failed.push({ n: i + 1, reason: `download failed (${e.message})` });
        continue;
      }
      if (buffer.length < 512) { failed.push({ n: i + 1, reason: 'empty file' }); continue; }

      await edit(sock, chat, status, `📤 *Sending ${i + 1}/${total}…*`);
      const r = await sendPostfetchItem(sock, chat, msg, buffer, item, i);
      if (r.ok) sent++; else failed.push({ n: i + 1, reason: r.reason || 'send failed' });
      buffer = null;
      if (i < total - 1) await sleep(ITEM_GAP_MS);
    }
  }
  return { sent, total, failed };
}

// Final status + reaction. Green tick ONLY when everything was really delivered.
async function finishPostDelivery(sock, chat, msg, status, r, extra = '') {
  if (r.failed.length === 0) {
    await edit(sock, chat, status, `✅ *Download complete* (${r.sent}/${r.total} sent)${extra}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
    await react(sock, chat, msg, '☑');
    return;
  }
  const why = r.failed.slice(0, 5).map((f) => `• #${f.n}: ${f.reason}`).join('\n');
  await edit(sock, chat, status, `⚠️ *Sent ${r.sent}/${r.total}*\n${why}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
  await react(sock, chat, msg, '⚠️');
}

export async function downloadPostMediaDirect(sock, chat, msg, url, asZip = false) {
  if (!isPostUrl(url)) {
    return sock.sendMessage(chat, {
      text: '❌ *Not a post URL:* try `.dl <url>` for videos or `.ig`, `.tiktok` for profile search.',
    }, { quoted: msg });
  }
  const status = await sock.sendMessage(chat, { text: `📦 *Postfetch:* Resolving post media…` }, { quoted: msg });
  try {
    const result = await withTimeout(postfetch(url), YTDLP_TIMEOUT, 'postfetch resolve');
    if (!result?.items?.length) throw new Error('No media items found in this post');

    if (asZip) {
      await edit(sock, chat, status, `📦 *Archiving ${result.items.length} items into ZIP…*`);
      const zip = await withTimeout(pfArchive(result), YTDLP_TIMEOUT, 'postfetch archive');
      await sock.sendMessage(chat, {
        document: Buffer.from(zip.bytes),
        fileName: zip.filename || 'post.zip',
        mimetype: zip.mime || 'application/zip',
        caption: `📦 *Post Archive* (${result.items.length} items)\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
      }, { quoted: msg });
      await edit(sock, chat, status, `✅ *ZIP complete*\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await react(sock, chat, msg, '☑');
      return;
    }

    const r = await deliverPostItems(sock, chat, msg, status, result.items);
    if (r.sent === 0) {
      const why = r.failed.slice(0, 3).map((f) => `#${f.n}: ${f.reason}`).join('; ');
      throw new Error(`Nothing could be sent${why ? ` — ${why}` : ''}`);
    }
    await finishPostDelivery(sock, chat, msg, status, r);
  } catch (e) {
    console.error('[postfetch]', e.message);
    await edit(sock, chat, status, `❌ *Post download failed:* ${e.message}`);
    await react(sock, chat, msg, '❌');
  }
}

function resolveYtdlpTarget(query) {
  return /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;
}

function collectFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out;
}

async function downloadMedia(sock, chat, msg, query, audioOnly) {
  const verbLabel = audioOnly ? '.mp3' : '.dl';
  const status = await sock.sendMessage(chat, {
    text: `${audioOnly ? '🎵' : '⬇️'} *${verbLabel}:* ${query}`,
  }, { quoted: msg });

  try {
    const isUrl = /^https?:\/\//i.test(query);

    if (isUrl && !isPostUrl(query) && !isYtDlpSupportedUrl(query)) {
      await edit(sock, chat, status,
        `❌ *Unsupported URL*\n\nThis site is not supported.\n\n` +
        `*Supported:* YouTube, SoundCloud, TikTok, Instagram, Facebook, ` +
        `Twitter/X, Reddit, Pinterest, Threads, Vimeo, Twitch, Dailymotion, ` +
        `Streamable, Bilibili, and more.`
      );
      await react(sock, chat, msg, '❌');
      return;
    }

    if (isUrl && !audioOnly && isPostUrl(query)) {
      await edit(sock, chat, status, '🖼️ *Fetching post media (@postfetch/core)…*');
      try {
        const pfResult = await withTimeout(postfetch(query), YTDLP_TIMEOUT, 'postfetch resolve');
        if (pfResult?.items?.length) {
          const r = await deliverPostItems(sock, chat, msg, status, pfResult.items);
          if (r.sent > 0) {
            await finishPostDelivery(sock, chat, msg, status, r);
            return;
          }
          console.warn('[download:postfetch] nothing sent, falling back to yt-dlp');
        }
      } catch (pfErr) {
        console.warn('[download:postfetch] falling back to ytdlp:', pfErr.message);
        await edit(sock, chat, status, '⬇️ *Postfetch failed, falling back to yt-dlp…*');
      }
    }

    cleanOldTmpFiles();
    const outputDir = getTmpDir();
    const filePrefix = `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputTemplate = path.join(outputDir, `${filePrefix}_%(title).60s.%(ext)s`);
    const target = resolveYtdlpTarget(query);

    await edit(sock, chat, status, audioOnly ? '🎵 *Extracting audio…*' : '⬇️ *Downloading…*');

    let downloadedFiles = [];
    try {
      const p = await withTimeout(
        runYtdlp(target, outputDir, filePrefix, (dl) => audioOnly
          ? dl.extractAudio().audioFormat('mp3').audioQuality('0').output(outputTemplate)
          : dl.addArgs('-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outputTemplate)),
        YTDLP_TIMEOUT, audioOnly ? 'ytdlp audio' : 'ytdlp video'
      );
      if (p && fs.existsSync(p)) downloadedFiles = [p];
    } catch (e) {
      await edit(sock, chat, status, `❌ *Download failed:* ${e.message}`);
      await react(sock, chat, msg, '❌');
      cleanPrefix(filePrefix, outputDir);
      return;
    }

    if (downloadedFiles.length === 0) {
      downloadedFiles = collectFiles(outputDir).filter(f => path.basename(f).startsWith(filePrefix));
    }
    if (!downloadedFiles.length) {
      await edit(sock, chat, status, '❌ *No media file was downloaded.*');
      await react(sock, chat, msg, '❌');
      cleanPrefix(filePrefix, outputDir);
      return;
    }

    const safeName = (query.replace(/[^\w\s-]/g, '').slice(0, 50).trim() || 'media');
    const totalFiles = Math.min(downloadedFiles.length, 20);
    let sentCount = 0;

    for (let i = 0; i < totalFiles; i++) {
      const file = downloadedFiles[i];
      if (!fs.existsSync(file)) continue;
      let buffer = fs.readFileSync(file);
      if (buffer.length < 1024) { cleanFile(file); continue; }
      let type = await classifyBuffer(buffer);

      if (audioOnly && !(type.kind === 'audio' && type.ext === 'mp3')) {
        await edit(sock, chat, status, '⚙️ *Converting to mp3…*');
        try {
          buffer = await withTimeout(bufferToMp3(buffer, 192), CONVERT_TIMEOUT, 'mp3 conversion');
          type = { kind: 'audio', ext: 'mp3', mime: 'audio/mpeg' };
        } catch (convErr) { console.warn('[download:mp3-convert]', convErr.message); }
      }

      const limit = type.kind === 'video' ? MAX_VIDEO : MAX_BYTES;
      if (buffer.length > limit) { cleanFile(file); continue; }

      try {
        if (type.kind === 'image') { await sock.sendMessage(chat, { image: buffer, mimetype: type.mime }, { quoted: msg }); sentCount++; }
        else if (type.kind === 'video') { await sock.sendMessage(chat, { video: buffer, mimetype: type.mime || 'video/mp4', fileName: `${safeName}.${type.ext}` }, { quoted: msg }); sentCount++; }
        else if (type.kind === 'audio') { await sock.sendMessage(chat, { audio: buffer, mimetype: type.mime || 'audio/mpeg', fileName: `${safeName}.${type.ext}`, ptt: false }, { quoted: msg }); sentCount++; }
        else { await sock.sendMessage(chat, { document: buffer, mimetype: type.mime, fileName: `${safeName}.${type.ext}` }, { quoted: msg }); sentCount++; }
      } finally { cleanFile(file); }

      if (totalFiles > 1) {
        await edit(sock, chat, status, `⬇️ *Downloading…* (${sentCount}/${totalFiles})`).catch(() => {});
      }
    }

    cleanPrefix(filePrefix, outputDir);

    if (sentCount === 0) {
      await edit(sock, chat, status, '❌ *Downloaded files were empty or exceeded size limits.*');
      await react(sock, chat, msg, '❌');
      return;
    }

    await edit(sock, chat, status, `✅ *Download complete*\n_${safeName}_\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
    await react(sock, chat, msg, '☑');
  } catch (e) {
    console.error('[download]', e.message);
    await edit(sock, chat, status, `❌ *Failed:* ${e.message}`).catch(() => {});
    await react(sock, chat, msg, '❌');
  }
}

export async function ytdlCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.dl <url or query>`', { quoted: msg });

  const isUrl = /^https?:\/\//i.test(query);
  const isDirectMode = /\b(audio|mp3|video|zip|hd|sd)\b/i.test(query);

  if (isUrl && !isPostUrl(query) && !isYtDlpSupportedUrl(query)) {
    return sendWithCta(sock, chat,
      `❌ *Unsupported URL*\n\nThis site is not supported.\n\n` +
      `*Supported:* YouTube, SoundCloud, TikTok, Instagram, Facebook, ` +
      `Twitter/X, Reddit, Pinterest, Threads, Vimeo, Twitch, Dailymotion, ` +
      `Streamable, Bilibili, and more.`, { quoted: msg });
  }

  if (isUrl && !isDirectMode && !args.includes('--direct')) {
    const p = getPrefix();
    return sendInteractive(sock, chat, {
      body: `⬇️ *Download Media Options*\n\nURL: _${query.slice(0, 70)}${query.length > 70 ? '…' : ''}_\n\nSelect your desired format:`,
      footer: 'Provided by 𝐀𝐥-𝐉𝐢𝐧',
      buttons: [
        createQuickReply('🎬 Video (Best)', `${p}dl ${query} --direct`),
        createQuickReply('🎵 Audio MP3', `${p}mp3 ${query}`),
        isPostUrl(query) ? createQuickReply('📦 ZIP Archive', `${p}pdlzip ${query}`) : null,
      ].filter(Boolean),
    }, { quoted: msg });
  }

  const cleanQuery = query.replace(/--direct/gi, '').trim();
  return queue.add(() => downloadMedia(sock, chat, msg, cleanQuery, false));
}

export async function mp3Command(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.mp3 <url or query>`', { quoted: msg });

  const isUrl = /^https?:\/\//i.test(query);
  if (isUrl && !isYtDlpSupportedUrl(query) && !isPostUrl(query)) {
    return sendWithCta(sock, chat,
      `❌ *Unsupported URL for audio extraction.*\n\n_Tip: for carousel/image posts, use \`.pdl <url>\`._`,
      { quoted: msg });
  }

  return queue.add(() => downloadMedia(sock, chat, msg, query, true));
}

export async function pdlCommand(sock, chat, msg, args) {
  const input = (args || []).join(' ').trim();
  if (!input) {
    return sendWithCta(sock, chat, '📦 *pdl* — Download Post/Carousel Media\n\nUsage:\n• `.pdl <post-url>`\n• `.pdl <post-url> zip` or `.pdlzip <post-url>`', { quoted: msg });
  }
  let asZip = false;
  let url = input;
  if (/\bzip\b/i.test(input) || /--zip/i.test(input)) {
    asZip = true;
    url = input.replace(/\bzip\b/gi, '').replace(/--zip/gi, '').trim();
  }
  return queue.add(() => downloadPostMediaDirect(sock, chat, msg, url, asZip));
}

export async function pdlzipCommand(sock, chat, msg, args) {
  const url = (args || []).join(' ').trim();
  if (!url) {
    return sendWithCta(sock, chat, '📦 *pdlzip* — Post/Carousel as ZIP\n\nUsage: `.pdlzip <post-url>`', { quoted: msg });
  }
  return queue.add(() => downloadPostMediaDirect(sock, chat, msg, url, true));
}

export async function twitterCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.twitter <tweet-url>` or `.tw <tweet-url>`', { quoted: msg });
  if (isPostUrl(query)) return pdlCommand(sock, chat, msg, args);
  return ytdlCommand(sock, chat, msg, args);
}

export async function pinterestCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.pinterest <pin-url>` or `.pin <pin-url>`', { quoted: msg });
  if (isPostUrl(query)) return pdlCommand(sock, chat, msg, args);
  return ytdlCommand(sock, chat, msg, args);
}

export async function threadsCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.threads <threads-url>`', { quoted: msg });
  if (isPostUrl(query)) return pdlCommand(sock, chat, msg, args);
  return ytdlCommand(sock, chat, msg, args);
}

export async function redditCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.reddit <reddit-post-url>`', { quoted: msg });
  if (isPostUrl(query)) return pdlCommand(sock, chat, msg, args);
  return ytdlCommand(sock, chat, msg, args);
}

export async function youtubeCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.youtube <url or query>` or `.yt <url or query>`', { quoted: msg });
  return ytdlCommand(sock, chat, msg, args);
}
