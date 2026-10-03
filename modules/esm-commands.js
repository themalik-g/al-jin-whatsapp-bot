// ─────────────────────────────────────────────
// Al-Jin · modules/esm-commands.js
// ESM API integration commands:
// .jindl, .jinvideo, .jinytsearch, .jinimage, .jinai, .jinapk
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fetchEsmApi } from '../lib/esm.js';
import { getTmpDir } from '../lib/ytdlp.js';
import { downloadToFile } from '../lib/net.js';

async function react(sock, msg, emoji) {
  try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {}
}

export async function jindlCommand(sock, chat, msg, args) {
  const url = (args || []).join(' ').trim();
  if (!url) return sock.sendMessage(chat, { text: '📥 Usage: `.jindl <media-url>`' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: '📥 *Jindl:* fetching media via ESM API…' }, { quoted: msg });
  try {
    const res = await fetchEsmApi('/downloader/aio', { url });
    if (!res.ok || !res.data || !res.data.status) {
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    }
    const media = res.data.data;
    const dlUrl = media?.url || media?.video || media?.audio || (Array.isArray(media) ? media[0]?.url : null) || (media?.medias ? media.medias[0]?.url : null);
    if (!dlUrl) throw new Error('No downloadable URL found in response.');

    const isVideo = /video|mp4/i.test(media?.type || dlUrl);
    const ext = isVideo ? 'mp4' : 'jpg';
    const dest = path.join(getTmpDir(), `jindl_${Date.now()}.${ext}`);
    await downloadToFile(dlUrl, dest, 80 * 1024 * 1024);

    if (isVideo) {
      await sock.sendMessage(chat, { video: { url: dest }, mimetype: 'video/mp4', caption: 'Provided by 𝐀λ-𝐉𝐢𝐧 (ESM)' }, { quoted: msg });
    } else {
      await sock.sendMessage(chat, { image: { url: dest }, caption: 'Provided by 𝐀λ-𝐉𝐢𝐧 (ESM)' }, { quoted: msg });
    }
    await sock.sendMessage(chat, { text: '✅ *Jindl:* complete', edit: st.key }).catch(() => {});
    await react(sock, msg, '☑');
  } catch (e) {
    await sock.sendMessage(chat, { text: `❌ *Jindl failed:* ${e.message}`, edit: st.key }).catch(() => {});
    await react(sock, msg, '❌');
  }
}

export async function jinvideoCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: '🎬 Usage: `.jinvideo <url or search query>`' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: '🎬 *Jinvideo:* fetching video via ESM API…' }, { quoted: msg });
  try {
    const res = await fetchEsmApi('/youtube/ytvid', { url: query, q: query });
    if (!res.ok || !res.data || !res.data.status) {
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    }
    const data = res.data.data;
    const dlUrl = data?.url || data?.video || data?.download || (Array.isArray(data) ? data[0]?.url : null);
    if (!dlUrl) throw new Error('No video URL returned.');

    const dest = path.join(getTmpDir(), `jinvideo_${Date.now()}.mp4`);
    await downloadToFile(dlUrl, dest, 80 * 1024 * 1024);

    await sock.sendMessage(chat, { video: { url: dest }, mimetype: 'video/mp4', caption: `🎬 *${data?.title || 'YouTube Video'}*\n\nProvided by 𝐀λ-𝐉𝐢𝐧 (ESM)` }, { quoted: msg });
    await sock.sendMessage(chat, { text: '✅ *Jinvideo:* complete', edit: st.key }).catch(() => {});
    await react(sock, msg, '☑');
  } catch (e) {
    await sock.sendMessage(chat, { text: `❌ *Jinvideo failed:* ${e.message}`, edit: st.key }).catch(() => {});
    await react(sock, msg, '❌');
  }
}

export async function jinytsearchCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: '🔍 Usage: `.jinytsearch <query>`' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: '🔍 *Jinytsearch:* searching YouTube…' }, { quoted: msg });
  try {
    const res = await fetchEsmApi('/youtube/ytsearch', { q: query });
    if (!res.ok || !res.data || !res.data.status) {
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    }
    const items = Array.isArray(res.data.data) ? res.data.data : (res.data.data?.results || res.data.results || []);
    if (!items.length) throw new Error('No results found.');

    const top = items.slice(0, 5);
    const lines = [`🔍 *YouTube Search Results for "${query}"*`, ''];
    top.forEach((it, idx) => {
      lines.push(`*${idx + 1}. ${it.title || 'Video'}*`);
      if (it.duration) lines.push(`⏱ Duration: ${it.duration}`);
      lines.push(`🔗 ${it.url || it.link || `https://youtu.be/${it.id || it.videoId}`}`);
      lines.push('');
    });
    lines.push('Provided by 𝐀λ-𝐉𝐢𝐧 (ESM)');

    await sock.sendMessage(chat, { text: lines.join('\n') }, { quoted: msg });
    await sock.sendMessage(chat, { text: '✅ *Jinytsearch:* done', edit: st.key }).catch(() => {});
    await react(sock, msg, '☑');
  } catch (e) {
    await sock.sendMessage(chat, { text: `❌ *Jinytsearch failed:* ${e.message}`, edit: st.key }).catch(() => {});
    await react(sock, msg, '❌');
  }
}

export async function jinimageCommand(sock, chat, msg, args) {
  const prompt = (args || []).join(' ').trim();
  if (!prompt) return sock.sendMessage(chat, { text: '🎨 Usage: `.jinimage <prompt>`' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: '🎨 *Jinimage:* generating image…' }, { quoted: msg });
  try {
    const res = await fetchEsmApi('/ai/image', { prompt });
    if (!res.ok || !res.data || !res.data.status) {
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    }
    const imgUrl = res.data.data?.url || res.data.data?.image || res.data.url;
    if (!imgUrl) throw new Error('No image URL returned.');

    const dest = path.join(getTmpDir(), `jinimg_${Date.now()}.jpg`);
    await downloadToFile(imgUrl, dest, 10 * 1024 * 1024);

    await sock.sendMessage(chat, { image: { url: dest }, caption: `🎨 *${prompt}*\n\nProvided by 𝐀λ-𝐉𝐢𝐧 (ESM)` }, { quoted: msg });
    await sock.sendMessage(chat, { text: '✅ *Jinimage:* complete', edit: st.key }).catch(() => {});
    await react(sock, msg, '☑');
  } catch (e) {
    await sock.sendMessage(chat, { text: `❌ *Jinimage failed:* ${e.message}`, edit: st.key }).catch(() => {});
    await react(sock, msg, '❌');
  }
}

export async function jinaiCommand(sock, chat, msg, args) {
  const prompt = (args || []).join(' ').trim();
  if (!prompt) return sock.sendMessage(chat, { text: '🤖 Usage: `.jinai <prompt>`' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: '🤖 *Jinai:* thinking…' }, { quoted: msg });
  try {
    const res = await fetchEsmApi('/ai/blackbox', { q: prompt, prompt });
    if (!res.ok || !res.data || !res.data.status) {
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    }
    const reply = res.data.data?.response || res.data.data?.text || res.data.response || res.data.text;
    if (!reply) throw new Error('Empty response from AI.');

    await sock.sendMessage(chat, { text: `🤖 *Jin AI Response:*\n\n${reply}\n\nProvided by 𝐀λ-𝐉𝐢𝐧 (ESM)` }, { quoted: msg });
    await sock.sendMessage(chat, { text: '✅ *Jinai:* complete', edit: st.key }).catch(() => {});
    await react(sock, msg, '☑');
  } catch (e) {
    await sock.sendMessage(chat, { text: `❌ *Jinai failed:* ${e.message}`, edit: st.key }).catch(() => {});
    await react(sock, msg, '❌');
  }
}

export async function jinapkCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: '📲 Usage: `.jinapk <app name>`' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: '📲 *Jinapk:* searching APK…' }, { quoted: msg });
  try {
    // First search for apk
    const searchRes = await fetchEsmApi('/apksearch', { q: query });
    if (!searchRes.ok || !searchRes.data || !searchRes.data.status) {
      throw new Error(searchRes.data?.error || `HTTP ${searchRes.status}`);
    }
    const items = Array.isArray(searchRes.data.data) ? searchRes.data.data : (searchRes.data.data?.results || []);
    if (!items.length) throw new Error('No APK found.');

    const first = items[0];
    const appId = first.id || first.package || first.name || query;

    await sock.sendMessage(chat, { text: `📲 *Downloading APK:* ${first.name || query}…`, edit: st.key }).catch(() => {});

    // Now fetch download link
    const dlRes = await fetchEsmApi('/apkdl', { id: appId, q: appId });
    if (!dlRes.ok || !dlRes.data || !dlRes.data.status) {
      throw new Error(dlRes.data?.error || `HTTP ${dlRes.status}`);
    }
    const dlData = dlRes.data.data;
    const apkUrl = dlData?.dllink || dlData?.download || dlData?.url;
    if (!apkUrl) throw new Error('No APK download link returned.');

    const dest = path.join(getTmpDir(), `jinapk_${Date.now()}.apk`);
    await downloadToFile(apkUrl, dest, 100 * 1024 * 1024);

    await sock.sendMessage(chat, {
      document: { url: dest },
      mimetype: 'application/vnd.android.package-archive',
      fileName: `${(first.name || 'app').replace(/[^a-zA-Z0-9_-]/g, '_')}.apk`,
      caption: `📲 *${first.name || query}*\n\nProvided by 𝐀λ-𝐉𝐢𝐧 (ESM)`
    }, { quoted: msg });

    await sock.sendMessage(chat, { text: '✅ *Jinapk:* complete', edit: st.key }).catch(() => {});
    await react(sock, msg, '☑');
  } catch (e) {
    await sock.sendMessage(chat, { text: `❌ *Jinapk failed:* ${e.message}`, edit: st.key }).catch(() => {});
    await react(sock, msg, '❌');
  }
}
