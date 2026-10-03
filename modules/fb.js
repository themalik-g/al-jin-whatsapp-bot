// ─────────────────────────────────────────────
// Al-Jin · modules/fb.js — .fb fix
// Why the old .fb failed:
//  1. Profile/page lookups scraped facebook.com HTML → always the login wall ("Facebook" title) → "Could not fetch".
//  2. Post/video URLs went to @postfetch only, with NO yt-dlp fallback (postfetch can't do most FB videos).
//  3. share/reel/watch links dropped into the generic .dl menu → extra "pick a format" step → felt broken.
// Now: resolve redirects → yt-dlp first → postfetch fallback; page lookup via public OpenGraph tags.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { runYtdlp, getTmpDir, cleanPrefix, cleanOldTmpFiles } from '../lib/ytdlp.js';
import { downloadToFile, BROWSER_USER_AGENT } from '../lib/net.js';
import { isOwner } from '../core/identity.js';
import { downloadPostMediaDirect, isPostUrl } from './download.js';
import { getKey } from '../core/keys.js';

const MAX_MB = Number(getKey('FB_MAX_MB')) || 100;
const edit = (sock, chat, st, text) => sock.sendMessage(chat, { text, edit: st.key }).catch(() => {});

async function resolveUrl(raw) {
  let url = raw.replace(/^http:/i, 'https:').replace(/\/\/(m|mbasic|web|l|lm)\.facebook\.com/i, '//www.facebook.com');
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12000);
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': BROWSER_USER_AGENT }, signal: ac.signal });
    clearTimeout(t);
    r.body?.cancel().catch(() => {});
    if (r.url && /facebook\.com|fb\.watch/i.test(r.url) && !/\/login/i.test(r.url)) url = r.url;
  } catch {}
  return url.replace(/\/\/m\.facebook\.com/i, '//www.facebook.com');
}

async function downloadFb(sock, chat, msg, raw) {
  const st = await sock.sendMessage(chat, { text: '📘 *Facebook:* resolving link…' }, { quoted: msg });
  const url = await resolveUrl(raw);
  cleanOldTmpFiles();
  const dir = getTmpDir();
  const prefix = `fb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const tmpl = path.join(dir, `${prefix}_%(id).30s.%(ext)s`);
  let ytErr;
  try {
    await edit(sock, chat, st, '⬇️ *Facebook:* downloading…');
    const file = await runYtdlp(url, dir, prefix, (dl) => dl.addArgs(
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b', '--merge-output-format', 'mp4', '-o', tmpl));
    const size = fs.statSync(file).size;
    if (size > MAX_MB * 1048576) throw new Error(`file is ${(size / 1048576).toFixed(0)} MB (limit ${MAX_MB} MB)`);
    const isImg = /\.(jpe?g|png|webp)$/i.test(file);
    await sock.sendMessage(chat, isImg
      ? { image: { url: file }, caption: 'Provided by 𝐀𝐥-𝐉𝐢𝐧' }
      : { video: { url: file }, mimetype: 'video/mp4', caption: 'Provided by 𝐀𝐥-𝐉𝐢𝐧' }, { quoted: msg });
    await edit(sock, chat, st, '✅ *Facebook:* done');
    return sock.sendMessage(chat, { react: { text: '☑', key: msg.key } }).catch(() => {});
  } catch (e) {
    ytErr = e; console.warn('[fb] yt-dlp failed:', e.message);
  } finally { cleanPrefix(prefix, dir); }

  // fallback: postfetch (photos / posts)
  if (isPostUrl(url)) {
    await edit(sock, chat, st, '🖼️ *Facebook:* trying post fetcher…');
    return downloadPostMediaDirect(sock, chat, msg, url, false);
  }
  const hint = /login|private|cookie|sign in|rate/i.test(ytErr?.message || '')
    ? '\n\n_Looks like a private / login-only post. Export Facebook cookies with `.ytcookies` and try again._' : '';
  await edit(sock, chat, st, `❌ *Facebook download failed:* ${(ytErr?.message || 'unknown error').slice(0, 220)}${hint}`);
  return sock.sendMessage(chat, { react: { text: '❌', key: msg.key } }).catch(() => {});
}

// Public pages expose only OpenGraph data to link-preview bots.
async function pageCard(sock, chat, msg, name) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) return sock.sendMessage(chat, { text: '⛔ Owner only (profile lookup). Send a post/video URL to download.' }, { quoted: msg });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(`https://www.facebook.com/${encodeURIComponent(name)}`, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Accept-Language': 'en' },
      signal: ac.signal,
    });
    const html = await r.text();
    const og = (p) => html.match(new RegExp(`<meta property="og:${p}" content="([^"]*)"`, 'i'))?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'") || '';
    const title = og('title'); const desc = og('description'); const img = og('image');
    if (!title || /^(facebook|log in)/i.test(title)) throw new Error('page not public or not found');
    const caption = `📘 *${title}*\n\n${desc.slice(0, 400) || '—'}\n\n🔗 https://www.facebook.com/${name}\n_Facebook only shares public preview data (no follower counts) with bots._\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
    if (img) {
      const dest = path.join(getTmpDir(), `fbp_${Date.now()}.jpg`);
      try {
        await downloadToFile(img, dest, 3 * 1024 * 1024);
        return await sock.sendMessage(chat, { image: { url: dest }, caption }, { quoted: msg });
      } catch {} finally { try { fs.unlinkSync(dest); } catch {} }
    }
    return sock.sendMessage(chat, { text: caption }, { quoted: msg });
  } catch (e) {
    return sock.sendMessage(chat, { text: `❌ Could not read *${name}*: ${e.message}` }, { quoted: msg });
  } finally { clearTimeout(t); }
}

export async function fbCommand(sock, chat, msg, args) {
  const input = (args?.[0] || '').trim();
  if (!input) return sock.sendMessage(chat, { text: '📘 Usage:\n`.fb <video/reel/post URL>` — download\n`.fb <page name>` — public page card (owner)' }, { quoted: msg });
  try {
    if (/^https?:\/\//i.test(input)) return await downloadFb(sock, chat, msg, input);
    return await pageCard(sock, chat, msg, input.replace(/^@/, ''));
  } catch (e) {
    return sock.sendMessage(chat, { text: `⚠️ fb failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
