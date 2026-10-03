// ─────────────────────────────────────────────
// Al-Jin · modules/devices.js
//   .mobileinfo <model>  → search GSMArena → pick a number → full specs (+RAM/ROM variants)
//   .laptopinfo <model>  → no keyless laptop database exists, so this one is AI-compiled
//                          (clearly labelled) with a Notebookcheck link for verification.
// Regex parsing (no cheerio), 1 request / 2 s queue, small TTL cache → low RAM, polite to GSMArena.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { BROWSER_USER_AGENT, downloadToFile } from '../lib/net.js';
import { getTmpDir } from '../lib/ytdlp.js';
import { registerChoices, createQuickReply } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';
import { kiloChat } from '../lib/ai.js';

const GSM = 'https://www.gsmarena.com';
const CACHE_TTL = 6 * 3600_000;
const cache = new Map();                // url → { at, html }  (max 12 pages)
const pending = new Map();              // `${kind}:${chat}` → { at, items }
const PENDING_TTL = 3 * 60_000;

// ── polite fetch queue ──────────────────────────────────────────────────
let chain = Promise.resolve();
let lastAt = 0;
function politeGet(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.html);
  const job = chain.then(async () => {
    const wait = 2000 - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept-Language': 'en' }, signal: ac.signal });
      lastAt = Date.now();
      if (res.status === 429) throw new Error('GSMArena is rate-limiting this IP — try again in a few minutes');
      if (!res.ok) throw new Error(`GSMArena HTTP ${res.status}`);
      const html = await res.text();
      cache.set(url, { at: Date.now(), html });
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      return html;
    } finally { clearTimeout(t); }
  });
  chain = job.catch(() => {});
  return job;
}

const decode = (s) => s
  .replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

// ── GSMArena parsing (exported for tests) ───────────────────────────────
export function parseSearch(html) {
  const out = []; const seen = new Set();
  const re = /<li>\s*<a href="([a-z0-9_]+-\d+)\.php"[^>]*>[\s\S]*?<strong>\s*<span>([\s\S]*?)<\/span>\s*<\/strong>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ slug: m[1], name: decode(m[2].replace(/<br\s*\/?>/gi, ' ')) });
  }
  return out;
}

export function parseSpecs(html) {
  const specs = {};
  const re = /data-spec="([\w-]+)"[^>]*>([\s\S]*?)<\/(?:td|span|h1|strong|div)>/gi;
  let m;
  while ((m = re.exec(html))) if (!(m[1] in specs)) specs[m[1]] = decode(m[2]);
  const img = html.match(/class="specs-photo-main">\s*<a[^>]*>\s*<img src="([^"]+)"/i)?.[1] || null;
  return { name: specs.modelname || '', specs, img };
}

const FIELDS = [
  ['📅', 'Announced', 'year'], ['📌', 'Status', 'status'], ['📐', 'Size', 'dimensions'], ['⚖️', 'Weight', 'weight'],
  ['🧱', 'Build', 'build'], ['💳', 'SIM', 'sim'],
  ['🖥️', 'Display', 'displaytype'], ['📏', 'Screen', 'displaysize'], ['🔍', 'Resolution', 'displayresolution'],
  ['🤖', 'OS', 'os'], ['⚙️', 'Chipset', 'chipset'], ['🧠', 'CPU', 'cpu'], ['🎮', 'GPU', 'gpu'],
  ['💾', 'RAM / Storage', 'internalmemory'], ['🗂️', 'Card slot', 'cardslot'],
  ['📷', 'Main camera', 'cam1modules'], ['🤳', 'Selfie', 'cam2modules'],
  ['🔋', 'Battery', 'batdescription1'], ['⚡', 'Charging', 'charging'],
  ['📶', 'Network', 'nettech'], ['📡', 'WLAN', 'wlan'], ['🔵', 'Bluetooth', 'bluetooth'], ['📲', 'NFC', 'nfc'], ['🔌', 'USB', 'usb'],
  ['🎨', 'Colors', 'colors'], ['💰', 'Price', 'price'],
];

export function formatSpecs(name, specs) {
  const lines = [`📱 *${name}*`, ''];
  for (const [icon, label, key] of FIELDS) {
    const v = specs[key];
    if (v && v !== '-') lines.push(`${icon} *${label}* · ${v.length > 220 ? v.slice(0, 217) + '…' : v}`);
  }
  lines.push('', 'Source: GSMArena · Provided by 𝐀𝐥-𝐉𝐢𝐧');
  return lines.join('\n');
}

// ── pick-a-number plumbing ──────────────────────────────────────────────
function offerChoices(sock, chat, msg, kind, cmd, items, title) {
  pending.set(`${kind}:${chat}`, { at: Date.now(), items });
  const p = getPrefix();
  const sender = msg.key.participant || msg.key.remoteJid;
  registerChoices(chat, sender, items.map((_, i) => createQuickReply(String(i + 1), `${p}${cmd} pick${i + 1}`)));
  const list = items.map((it, i) => `*${i + 1}.* ${it.name}`).join('\n');
  return sock.sendMessage(chat, { text: `${title}\n\n${list}\n\n_Reply with the number (or \`${p}${cmd} pick2\`)._` }, { quoted: msg });
}
function takePick(kind, chat, token) {
  const n = Number(String(token).replace(/^pick/i, ''));
  const rec = pending.get(`${kind}:${chat}`);
  if (!rec || Date.now() - rec.at > PENDING_TTL) return null;
  return rec.items[n - 1] || null;
}

async function sendDetail(sock, chat, msg, slug) {
  const html = await politeGet(`${GSM}/${slug}.php`);
  const { name, specs, img } = parseSpecs(html);
  if (!name && !Object.keys(specs).length) throw new Error('could not read the spec page');
  const text = formatSpecs(name || slug.replace(/_/g, ' '), specs);
  if (img) {
    const dest = path.join(getTmpDir(), `gsm_${Date.now()}.jpg`);
    try {
      await downloadToFile(img, dest, 2 * 1024 * 1024);
      return await sock.sendMessage(chat, { image: { url: dest }, caption: text }, { quoted: msg });
    } catch {} finally { try { fs.unlinkSync(dest); } catch {} }
  }
  return sock.sendMessage(chat, { text }, { quoted: msg });
}

export async function mobileinfoCommand(sock, chat, msg, rest) {
  const q = rest.join(' ').trim();
  if (!q) return sock.sendMessage(chat, { text: '📱 Usage: `.mobileinfo <model>`\nExample: `.mobileinfo s23` · `.mobileinfo itel s23`' }, { quoted: msg });
  try {
    if (/^pick\d+$/i.test(q)) {
      const it = takePick('mobile', chat, q);
      if (!it) return sock.sendMessage(chat, { text: '⌛ That list expired — run `.mobileinfo <model>` again.' }, { quoted: msg });
      return await sendDetail(sock, chat, msg, it.slug);
    }
    const html = await politeGet(`${GSM}/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(q)}`);
    const items = parseSearch(html);
    if (!items.length) return sock.sendMessage(chat, { text: `❌ No phone found for *${q}*.` }, { quoted: msg });
    if (items.length === 1) return await sendDetail(sock, chat, msg, items[0].slug);
    return await offerChoices(sock, chat, msg, 'mobile', 'mobileinfo', items, `📱 *${items.length} matches for "${q}"*`);
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ mobileinfo failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── laptops (AI-compiled) ───────────────────────────────────────────────
async function aiJson(prompt) {
  const { text } = await kiloChat([
    { role: 'system', content: 'You are a precise hardware database. Output exactly what is asked, no commentary.' },
    { role: 'user', content: prompt },
  ], 0, { maxTokens: 700 });
  return text;
}

export async function laptopinfoCommand(sock, chat, msg, rest) {
  const q = rest.join(' ').trim();
  if (!q) return sock.sendMessage(chat, { text: '💻 Usage: `.laptopinfo <model>`\nExample: `.laptopinfo thinkpad x1 carbon` · `.laptopinfo macbook air m3`' }, { quoted: msg });
  try {
    if (/^pick\d+$/i.test(q)) {
      const it = takePick('laptop', chat, q);
      if (!it) return sock.sendMessage(chat, { text: '⌛ That list expired — run `.laptopinfo <model>` again.' }, { quoted: msg });
      return await laptopDetail(sock, chat, msg, it.name);
    }
    const raw = await aiJson(`List up to 6 real laptop models or series that match "${q}" (include the brand, e.g. "Lenovo ThinkPad X1 Carbon Gen 11"). Reply with ONLY a JSON array of strings.`);
    let names = [];
    try { names = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]').filter((s) => typeof s === 'string').slice(0, 6); } catch {}
    if (!names.length) return sock.sendMessage(chat, { text: `❌ No laptop found for *${q}*.` }, { quoted: msg });
    if (names.length === 1) return await laptopDetail(sock, chat, msg, names[0]);
    return await offerChoices(sock, chat, msg, 'laptop', 'laptopinfo', names.map((name) => ({ name })), `💻 *${names.length} matches for "${q}"*`);
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ laptopinfo failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

async function laptopDetail(sock, chat, msg, name) {
  const text = await aiJson(
    `Give the specifications of the laptop "${name}" in plain text, one line each, exactly in this format and nothing else:\n` +
    'Released: ...\nDisplay: ...\nCPU options: ...\nGPU options: ...\nRAM options: ...\nStorage options: ...\nBattery: ...\nPorts: ...\nWeight: ...\nOS: ...\n' +
    'Write "unknown" for anything you are not sure about. Never guess numbers.');
  const link = `https://www.notebookcheck.net/Search.8222.0.html?q=${encodeURIComponent(name)}`;
  return sock.sendMessage(chat, {
    text: `💻 *${name}*\n\n${text.slice(0, 2500)}\n\n⚠️ _AI-compiled from model knowledge (no free laptop spec API exists) — verify:_\n${link}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
  }, { quoted: msg });
}
