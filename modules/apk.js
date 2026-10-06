// ─────────────────────────────────────────────
// Al-Jin · modules/apk.js
//   .apk <name|package>      → real, unmodified APK  (Aptoide API → F-Droid fallback)
//   .betaapk <name|package>  → newest beta/alpha/RC build if the store lists one
// Files are streamed to disk and sent from disk (never held in RAM).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { downloadToFile, BROWSER_USER_AGENT } from '../lib/net.js';
import { getTmpDir } from '../lib/ytdlp.js';
import { getKey } from '../core/keys.js';
import { getMaxDownloadMB } from '../core/limits.js';

// APK_MAX_MB in keys.env still wins; otherwise the live .dlcap value is used.
const maxMB = () => Number(getKey('APK_MAX_MB')) || getMaxDownloadMB();
const APK_MIME = 'application/vnd.android.package-archive';
const BETA_RE = /(beta|alpha|\brc\b|preview|canary|nightly|\bdev\b)/i;

async function getJson(url, timeout = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function getText(url, timeout = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

const mb = (b) => (b / 1048576).toFixed(1);
const safe = (s) => String(s).replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'app';
const edit = (sock, chat, st, text) => sock.sendMessage(chat, { text, edit: st.key }).catch(() => {});

// ── source 1: Aptoide ───────────────────────────────────────────────────
function mapAptoide(a) {
  const f = a.file || {};
  return {
    source: 'Aptoide', name: a.name, pkg: a.package, version: f.vername || '?', vercode: f.vercode,
    size: f.filesize || a.size || 0, url: f.path || f.path_alt,
  };
}
async function aptoideSearch(q) {
  const isPkg = /^[a-z][\w]*(\.[\w]+)+$/i.test(q);
  const url = `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(q)}/limit=8`;
  const j = await getJson(url);
  let list = (j?.datalist?.list || []).map(mapAptoide).filter((a) => a.url);
  if (isPkg) list.sort((a, b) => (b.pkg === q) - (a.pkg === q));
  return list;
}
async function aptoideVersions(pkg) {
  const urls = [
    `https://ws75.aptoide.com/api/7/listAppVersions/package_name=${pkg}/limit=40`,
    `https://ws75.aptoide.com/api/7/app/getVersions/package_name=${pkg}/limit=40`,
  ];
  for (const u of urls) {
    try {
      const j = await getJson(u);
      const list = j?.datalist?.list || j?.list || [];
      if (list.length) return list.map((a) => ({ ...mapAptoide({ ...a, package: a.package || pkg, name: a.name }), pkg })).filter((a) => a.url);
    } catch {}
  }
  return [];
}

// ── source 2: F-Droid (open-source apps) ────────────────────────────────
async function fdroidFind(q) {
  let pkg = /^[a-z][\w]*(\.[\w]+)+$/i.test(q) ? q : null;
  if (!pkg) {
    const html = await getText(`https://search.f-droid.org/?q=${encodeURIComponent(q)}&lang=en`);
    pkg = html.match(/\/packages\/([a-z][\w.]+)\/?"/i)?.[1] || null;
  }
  if (!pkg) return null;
  const j = await getJson(`https://f-droid.org/api/v1/packages/${pkg}`);
  const code = j?.suggestedVersionCode || j?.packages?.[0]?.versionCode;
  const ver = (j?.packages || []).find((p) => p.versionCode === code);
  if (!code) return null;
  return { source: 'F-Droid', name: pkg, pkg, version: ver?.versionName || String(code), size: 0, url: `https://f-droid.org/repo/${pkg}_${code}.apk` };
}

async function sendApk(sock, chat, msg, status, app, label = 'APK') {
  const dest = path.join(getTmpDir(), `apk_${Date.now()}_${safe(app.pkg)}.apk`);
  try {
    if (app.size && app.size > maxMB() * 1048576) {
      await edit(sock, chat, status, `⚠️ *${app.name}* is ${mb(app.size)} MB — over the ${maxMB()} MB limit (raise it with .dlcap).\n\nDirect link:\n${app.url}`);
      return;
    }
    await edit(sock, chat, status, `⬇️ Downloading *${app.name}* ${app.version}${app.size ? ` (${mb(app.size)} MB)` : ''}…`);
    await downloadToFile(app.url, dest, maxMB() * 1048576);
    const size = fs.statSync(dest).size;
    if (size < 50_000) throw new Error('file too small — probably not an APK');
    await sock.sendMessage(chat, {
      document: { url: dest }, mimetype: APK_MIME,
      fileName: `${safe(app.name)}_${safe(app.version)}.apk`,
      caption: `📦 *${app.name}*\n• package · ${app.pkg}\n• version · ${app.version}\n• size · ${mb(size)} MB\n• source · ${app.source}\n\n_Unmodified ${label} from the store._\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
    }, { quoted: msg });
    await edit(sock, chat, status, '✅ Sent');
    await sock.sendMessage(chat, { react: { text: '☑', key: msg.key } }).catch(() => {});
  } finally { try { fs.unlinkSync(dest); } catch {} }
}

export async function apkCommand(sock, chat, msg, rest) {
  const q = rest.join(' ').trim();
  if (!q) return sock.sendMessage(chat, { text: '📦 Usage: `.apk <app name or package>`\nExample: `.apk telegram` · `.apk org.mozilla.firefox`' }, { quoted: msg });
  const status = await sock.sendMessage(chat, { text: `🔎 Searching *${q}*…` }, { quoted: msg });
  let app = null; const errs = [];
  try { app = (await aptoideSearch(q))[0]; } catch (e) { errs.push(`Aptoide: ${e.message}`); }
  if (!app) { try { app = await fdroidFind(q); } catch (e) { errs.push(`F-Droid: ${e.message}`); } }
  if (!app) {
    await edit(sock, chat, status, `❌ No APK found for *${q}*${errs.length ? `\n_${errs.join(' · ')}_` : ''}`);
    return sock.sendMessage(chat, { react: { text: '❌', key: msg.key } }).catch(() => {});
  }
  try { await sendApk(sock, chat, msg, status, app); }
  catch (e) {
    // download failed on Aptoide → try F-Droid once before giving up
    if (app.source === 'Aptoide') {
      try { const alt = await fdroidFind(app.pkg); if (alt) return await sendApk(sock, chat, msg, status, alt); } catch {}
    }
    await edit(sock, chat, status, `❌ Download failed: ${e.message}`);
    await sock.sendMessage(chat, { react: { text: '❌', key: msg.key } }).catch(() => {});
  }
}

export async function betaApkCommand(sock, chat, msg, rest) {
  const q = rest.join(' ').trim();
  if (!q) return sock.sendMessage(chat, { text: '🧪 Usage: `.betaapk <app name or package>`' }, { quoted: msg });
  const status = await sock.sendMessage(chat, { text: `🔎 Looking for beta builds of *${q}*…` }, { quoted: msg });
  try {
    const base = (await aptoideSearch(q))[0];
    if (!base) throw new Error('app not found');
    const vers = await aptoideVersions(base.pkg);
    const beta = vers.filter((v) => BETA_RE.test(v.version)).sort((a, b) => (b.vercode || 0) - (a.vercode || 0))[0];
    if (beta) return await sendApk(sock, chat, msg, status, { ...beta, name: beta.name || base.name }, 'beta APK');
    const link = `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${encodeURIComponent(base.name)}`;
    await edit(sock, chat, status,
      `🧪 No beta build of *${base.name}* is listed on Aptoide.\n\nStable is ${base.version} (\`.apk ${base.pkg}\`).\nBeta builds are usually only on APKMirror — open it yourself:\n${link}`);
  } catch (e) {
    await edit(sock, chat, status, `❌ betaapk failed: ${e.message}`);
  }
}
