// ─────────────────────────────────────────────
// Al-Jin · modules/igplus.js   (all OWNER-ONLY — they spend your IG session)
//   .igzip <user>      → ZIP of the user's first 40 media (needs IG_SESSIONID for >12)
// Instagram blocks anonymous requests from most hosting IPs. Two hosts are tried (web + app API) and a
// 429 starts a 10-minute pause so the IP / session is not hammered. Set the cookie from WhatsApp:
//   .setvar IG_SESSIONID <sessionid cookie of a SPARE account>
//   .igstory <user>    → current stories           (needs IG_SESSIONID — IG blocks anonymous)
//   .igsearch <name>   → find accounts by name     (usually needs IG_SESSIONID)
//   .igprofile <user>  → extended profile card
// Media is streamed to disk one file at a time; the ZIP is streamed too (see lib/zipstream.js).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { isOwner } from '../core/identity.js';
import { getKey } from '../core/keys.js';
import { getVar } from '../core/vars.js';
import { downloadToFile, BROWSER_USER_AGENT } from '../lib/net.js';
import { getTmpDir } from '../lib/ytdlp.js';
import { ZipWriter } from '../lib/zipstream.js';
import { registerChoices, createQuickReply } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';

const MAX_ITEMS = 40;
const MAX_ZIP_BYTES = 95 * 1024 * 1024;     // stay safely under the 100 MB download rule
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function owner(sock, chat, msg) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (msg.key.fromMe || isOwner(from)) return true;
  sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg }).catch(() => {});
  return false;
}
const session = () => getVar('IG_SESSIONID') || getKey('IG_SESSIONID');
const APP_UA = 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)';
const HOSTS = [
  { base: 'https://www.instagram.com', ua: BROWSER_USER_AGENT },
  { base: 'https://i.instagram.com', ua: APP_UA },
];
const SESSION_HELP = 'Fix: send `.setvar IG_SESSIONID <cookie>` (instagram.com → DevTools → Application → Cookies → sessionid). Use a SPARE account.';
let igPausedUntil = 0;

const headers = (user, host) => {
  const h = {
    'X-IG-App-ID': '936619743392459', 'X-ASBD-ID': '198387', 'User-Agent': host.ua,
    Accept: '*/*', Referer: `https://www.instagram.com/${user || ''}`,
  };
  if (session()) h.Cookie = `sessionid=${session()}`;
  return h;
};

// Tries every host; remembers a 429 so the next commands fail fast instead of making it worse.
async function igJson(url, user) {
  const wait = igPausedUntil - Date.now();
  if (wait > 0) throw new Error(`Instagram rate limit — paused ${Math.ceil(wait / 60000)} more min to protect ${session() ? 'your session' : 'this IP'}${session() ? '' : `\n${SESSION_HELP}`}`);
  const { pathname, search } = new URL(url);
  let limited = 0; let denied = 0; let last = null;
  for (const host of HOSTS) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    try {
      const r = await fetch(`${host.base}${pathname}${search}`, { headers: headers(user, host), signal: ac.signal });
      if (r.status === 429) { limited++; continue; }
      if (r.status === 401 || r.status === 403) { denied++; continue; }
      if (r.status === 404 && host !== HOSTS[HOSTS.length - 1]) { last = new Error('Instagram HTTP 404'); continue; }
      if (!r.ok) { last = new Error(`Instagram HTTP ${r.status}`); continue; }
      const text = await r.text();
      try { return JSON.parse(text); } catch { denied++; continue; }      // HTML login wall instead of JSON
    } catch (e) { last = e; }
    finally { clearTimeout(t); }
  }
  if (limited) {
    igPausedUntil = Date.now() + 10 * 60_000;
    throw new Error(session()
      ? 'Instagram rate limit — your session is cooling down, wait ~10 minutes'
      : `Instagram is rate-limiting this server's IP for anonymous requests (common on hosting panels).\n${SESSION_HELP}`);
  }
  if (denied) throw new Error(session()
    ? 'Instagram refused the request — the session cookie may be expired or flagged'
    : `Instagram requires login from this IP.\n${SESSION_HELP}`);
  throw last || new Error('Instagram unreachable');
}

const cleanUser = (s) => String(s || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0].toLowerCase();

async function profile(username) {
  const j = await igJson(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, username);
  const u = j?.data?.user;
  if (!u) throw new Error(`user @${username} not found`);
  return u;
}

// ── media extraction ────────────────────────────────────────────────────
function fromFeedItem(it) {
  const out = [];
  const one = (n) => {
    if (n.video_versions?.length) out.push({ url: n.video_versions[0].url, ext: 'mp4' });
    else if (n.image_versions2?.candidates?.length) out.push({ url: n.image_versions2.candidates[0].url, ext: 'jpg' });
  };
  if (it.carousel_media?.length) it.carousel_media.forEach(one); else one(it);
  return out;
}
function fromEdgeNode(n) {
  const out = [];
  const one = (x) => out.push(x.is_video && x.video_url ? { url: x.video_url, ext: 'mp4' } : { url: x.display_url, ext: 'jpg' });
  const kids = n.edge_sidecar_to_children?.edges;
  if (kids?.length) kids.forEach((k) => one(k.node)); else one(n);
  return out.filter((m) => m.url);
}

async function collectMedia(u, username) {
  const media = [];
  let note = '';
  if (session()) {
    let maxId = ''; let guard = 0;
    while (media.length < MAX_ITEMS && guard++ < 8) {
      const j = await igJson(`https://www.instagram.com/api/v1/feed/user/${u.id}/?count=12${maxId ? `&max_id=${maxId}` : ''}`, username);
      for (const it of j.items || []) { media.push(...fromFeedItem(it)); if (media.length >= MAX_ITEMS) break; }
      if (!j.more_available || !j.next_max_id) break;
      maxId = j.next_max_id;
      await sleep(900);
    }
  } else {
    for (const e of u.edge_owner_to_timeline_media?.edges || []) media.push(...fromEdgeNode(e.node));
    note = '\n_No IG_SESSIONID set → only the latest ~12 posts are visible anonymously._';
  }
  return { media: media.slice(0, MAX_ITEMS), note };
}

const edit = (sock, chat, st, text) => sock.sendMessage(chat, { text, edit: st.key }).catch(() => {});

// ── .igzip ──────────────────────────────────────────────────────────────
export async function igzipCommand(sock, chat, msg, rest) {
  if (!owner(sock, chat, msg)) return;
  const username = cleanUser(rest[0]);
  if (!username) return sock.sendMessage(chat, { text: '📦 Usage: `.igzip <username>` — zips the first 40 media items' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: `🔎 Reading @${username}…` }, { quoted: msg });
  const dir = path.join(getTmpDir(), `igzip_${Date.now()}`);
  const zipPath = `${dir}.zip`;
  try {
    const u = await profile(username);
    if (u.is_private && !session()) throw new Error('account is private');
    const { media, note } = await collectMedia(u, username);
    if (!media.length) throw new Error(u.is_private ? 'private account — your session does not follow it' : 'no media found');

    fs.mkdirSync(dir, { recursive: true });
    const zip = new ZipWriter(zipPath);
    let added = 0; let total = 0; let skipped = 0;
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      const file = path.join(dir, `${String(i + 1).padStart(2, '0')}.${m.ext}`);
      try {
        await downloadToFile(m.url, file, MAX_FILE_BYTES);
        const size = fs.statSync(file).size;
        if (total + size > MAX_ZIP_BYTES) { skipped = media.length - i; fs.unlinkSync(file); break; }
        await zip.addFile(`${username}_${path.basename(file)}`, file);
        total += size; added++;
      } catch { skipped++; }
      try { fs.unlinkSync(file); } catch {}
      if ((i + 1) % 8 === 0) await edit(sock, chat, st, `⬇️ @${username}: ${i + 1}/${media.length}…`);
    }
    if (!added) { await zip.finalize().catch(() => {}); throw new Error('every download failed (Instagram CDN blocked it?)'); }
    await zip.finalize();
    await sock.sendMessage(chat, {
      document: { url: zipPath }, mimetype: 'application/zip', fileName: `${username}_${added}items.zip`,
      caption: `📦 *@${username}* — ${added} item${added > 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}\n${(total / 1048576).toFixed(1)} MB${note}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
    }, { quoted: msg });
    await edit(sock, chat, st, '✅ ZIP sent');
  } catch (e) {
    await edit(sock, chat, st, `❌ igzip failed: ${e.message}`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(zipPath); } catch {}
  }
}

// ── .igstory ────────────────────────────────────────────────────────────
export async function igstoryCommand(sock, chat, msg, rest) {
  if (!owner(sock, chat, msg)) return;
  const username = cleanUser(rest[0]);
  if (!username) return sock.sendMessage(chat, { text: '📖 Usage: `.igstory <username>`' }, { quoted: msg });
  if (!session()) return sock.sendMessage(chat, { text: '⚠️ Instagram only serves stories to logged-in sessions.\nSend `.setvar IG_SESSIONID <cookie>` (use a spare account, not your main).' }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: `🔎 Fetching @${username}'s stories…` }, { quoted: msg });
  try {
    const u = await profile(username);
    const j = await igJson(`https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${u.id}`, username);
    const items = j?.reels_media?.[0]?.items || j?.reels?.[u.id]?.items || [];
    if (!items.length) return edit(sock, chat, st, `ℹ️ @${username} has no active story right now.`);
    const media = items.flatMap(fromFeedItem).slice(0, 25);
    let sent = 0;
    for (const m of media) {
      const file = path.join(getTmpDir(), `igst_${Date.now()}_${sent}.${m.ext}`);
      try {
        await downloadToFile(m.url, file, MAX_FILE_BYTES);
        await sock.sendMessage(chat, m.ext === 'mp4' ? { video: { url: file } } : { image: { url: file } }, { quoted: msg });
        sent++;
      } catch {} finally { try { fs.unlinkSync(file); } catch {} }
      await sleep(700);
    }
    await edit(sock, chat, st, sent ? `✅ Sent ${sent}/${media.length} story item(s) of @${username}` : '❌ Could not download any story item');
  } catch (e) { await edit(sock, chat, st, `❌ igstory failed: ${e.message}`); }
}

// ── .igsearch ───────────────────────────────────────────────────────────
const igPending = new Map();
export async function igsearchCommand(sock, chat, msg, rest) {
  if (!owner(sock, chat, msg)) return;
  const q = rest.join(' ').trim();
  if (!q) return sock.sendMessage(chat, { text: '🔎 Usage: `.igsearch <name or keyword>`' }, { quoted: msg });
  try {
    if (/^pick\d+$/i.test(q)) {
      const rec = igPending.get(chat);
      const hit = rec && Date.now() - rec.at < 180000 ? rec.items[Number(q.slice(4)) - 1] : null;
      if (!hit) return sock.sendMessage(chat, { text: '⌛ List expired — search again.' }, { quoted: msg });
      return igprofileCommand(sock, chat, msg, [hit.username]);
    }
    const j = await igJson(`https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(q)}&include_reel=false`);
    const items = (j?.users || []).map((x) => x.user).filter(Boolean).slice(0, 8);
    if (!items.length) return sock.sendMessage(chat, { text: `❌ No accounts found for *${q}*.` }, { quoted: msg });
    igPending.set(chat, { at: Date.now(), items });
    if (igPending.size > 20) igPending.delete(igPending.keys().next().value);
    const p = getPrefix();
    registerChoices(chat, msg.key.participant || msg.key.remoteJid, items.map((_, i) => createQuickReply(String(i + 1), `${p}igsearch pick${i + 1}`)));
    const list = items.map((x, i) => `*${i + 1}.* @${x.username}${x.is_verified ? ' ✅' : ''} — ${x.full_name || '—'}${x.is_private ? ' 🔒' : ''}`).join('\n');
    await sock.sendMessage(chat, { text: `🔎 *Instagram results for "${q}"*\n\n${list}\n\n_Reply with a number for full details._` }, { quoted: msg });
  } catch (e) { await sock.sendMessage(chat, { text: `⚠️ igsearch failed: ${e.message}` }, { quoted: msg }).catch(() => {}); }
}

// ── .igprofile ──────────────────────────────────────────────────────────
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export async function igprofileCommand(sock, chat, msg, rest) {
  if (!owner(sock, chat, msg)) return;
  const username = cleanUser(rest[0]);
  if (!username) return sock.sendMessage(chat, { text: '👤 Usage: `.igprofile <username>`' }, { quoted: msg });
  try {
    const u = await profile(username);
    const lines = [
      `📸 *@${u.username}*${u.is_verified ? ' ✅' : ''}${u.is_private ? ' 🔒' : ''}`, '',
      `• *name* · ${u.full_name || '—'}`,
      `• *bio* · ${(u.biography || '—').slice(0, 300)}`,
      `• *followers* · ${fmt(u.edge_followed_by?.count)}`,
      `• *following* · ${fmt(u.edge_follow?.count)}`,
      `• *posts* · ${fmt(u.edge_owner_to_timeline_media?.count)}`,
      u.category_name ? `• *category* · ${u.category_name}` : '',
      u.external_url ? `• *link* · ${u.external_url}` : '',
      u.is_business_account ? '• *account* · business' : u.is_professional_account ? '• *account* · professional' : '',
      `• *user id* · ${u.id}`,
      '', '_Join date isn’t exposed by Instagram’s public API._', 'Provided by 𝐀𝐥-𝐉𝐢𝐧',
    ].filter(Boolean);
    const pic = u.profile_pic_url_hd || u.profile_pic_url;
    if (pic) {
      const dest = path.join(getTmpDir(), `igp_${Date.now()}.jpg`);
      try {
        await downloadToFile(pic, dest, 4 * 1024 * 1024);
        return await sock.sendMessage(chat, { image: { url: dest }, caption: lines.join('\n') }, { quoted: msg });
      } catch {} finally { try { fs.unlinkSync(dest); } catch {} }
    }
    await sock.sendMessage(chat, { text: lines.join('\n') }, { quoted: msg });
  } catch (e) { await sock.sendMessage(chat, { text: `⚠️ igprofile failed: ${e.message}` }, { quoted: msg }).catch(() => {}); }
}
