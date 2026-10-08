// ─────────────────────────────────────────────
//  Al-Jin · modules/x-movie.js
//  Free movie & series downloader (Internet Archive — public-domain / free titles).
//
//    .movie <name>                  top 5 → pick one → pick quality → download + send
//    .series <name> -ep 11          top 5 → pick show → pick quality → one episode
//    .series <name> -full           top 5 → pick show → best quality that fits .dlcap,
//                                   3 episodes per batch, then  .continue  for the next 3
//    .continue                      next 3 episodes of the last  -full  run in this chat
//    .movieinfo <title>             the old movie-INFO lookup (unchanged, just renamed)
//
//  Obeys  .dlcap  (core/limits.js): max size per file, max video height, and the
//  "send as document above N MB" rule. One download at a time (RAM + disk friendly),
//  every file is deleted right after it is sent.
//  Hidden helper verbs:  mvp (pick title)  ·  mvq (pick quality)
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import PQueue from 'p-queue';
import { reply, prefix, safe } from '../lib/x.js';
import { sendWithCta, createQuickReply } from '../lib/buttons.js';
import { inPollRun } from '../lib/poll.js';
import { editStatus } from '../lib/reaction-helper.js';
import { downloadToFile } from '../lib/net.js';
import {
  getMaxDownloadMB, getMaxDownloadBytes, getVideoHeight, getDocThresholdBytes, fmtMB,
} from '../core/limits.js';
import * as ia from '../lib/ia-movies.js';

const TMP_DIR = path.join(process.cwd(), 'vault', 'tmp', 'movies');
const queue = new PQueue({ concurrency: 1 });          // one download at a time
const SESSION_TTL = 15 * 60 * 1000;
const RUN_TTL = 3 * 60 * 60 * 1000;
const BATCH = 3;                                        // episodes per batch
const FOOTER = 'Provided by 𝐀𝐥-𝐉𝐢𝐧';
const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime' };

const P = () => prefix();
const sessions = new Map();   // token → pending selection
const runs = new Map();       // chat  → running "-full" series

// ── small helpers ────────────────────────────
function prune() {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.at > SESSION_TTL) sessions.delete(k);
  for (const [k, r] of runs) if (now - r.at > RUN_TTL) runs.delete(k);
  while (sessions.size > 40) sessions.delete(sessions.keys().next().value);
}
function newSession(data) {
  prune();
  let token; do { token = crypto.randomBytes(2).toString('hex'); } while (sessions.has(token));
  sessions.set(token, { ...data, at: Date.now() });
  return token;
}
function getSession(token, chat) {
  const s = sessions.get(String(token || '').toLowerCase());
  if (!s || s.chat !== chat || Date.now() - s.at > SESSION_TTL) return null;
  s.at = Date.now();
  return s;
}
const expired = (sock, chat, msg) =>
  reply(sock, chat, msg, `⌛ That selection expired. Start again with \`${P()}movie <name>\` or \`${P()}series <name> -ep 1\`.`);

const mb = (bytes) => (bytes ? `${fmtMB(bytes)} MB` : 'size ?');
const safeName = (s) => String(s).replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'video';
const limitsLine = () => `_Limits: ≤ ${getMaxDownloadMB()} MB · ≤ ${getVideoHeight()}p — change with_ \`${P()}dlcap\``;

/** Choice prompt. Buttons/numbered list normally; typed commands when a poll vote started this command. */
async function askChoice(sock, chat, msg, body, options) {
  const withId = options.map((o) => ({ label: o.label, id: `${P()}${o.cmd}` }));
  if (inPollRun()) {
    const lines = withId.map((o, i) => `${i + 1}. ${o.label}\n   ↳ \`${o.id}\``);
    return reply(sock, chat, msg, `${body}\n\n${lines.join('\n')}\n\n_Send the command next to your choice._`);
  }
  const buttons = withId.map((o) => createQuickReply(o.label.slice(0, 60), o.id));
  return sendWithCta(sock, chat, body, { quoted: msg, buttons, footer: FOOTER });
}

/** Why a file may not be downloaded under the current .dlcap — '' when it is fine. */
function capProblem(file) {
  if (file.size && file.size > getMaxDownloadBytes()) {
    return `${mb(file.size)} is above your download cap (${getMaxDownloadMB()} MB). Raise it with \`${P()}dlcap 1gb\` or pick a lower quality.`;
  }
  const h = file.bucket || 480;
  if (h > getVideoHeight()) {
    return `${h}p is above your max quality (${getVideoHeight()}p). Raise it with \`${P()}dlcap quality ${h}\` or pick a lower quality.`;
  }
  return '';
}

// ── download + send (one file) ───────────────
async function fetchAndSend(sock, chat, msg, { item, file, name, label, caption }) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const dest = path.join(TMP_DIR, `mv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${file.ext}`);
  const maxBytes = getMaxDownloadBytes();
  const status = await sock.sendMessage(chat, { text: `📥 Downloading *${name}* (${label}${file.size ? ` · ${mb(file.size)}` : ''})…` }, { quoted: msg });
  let ticker = null;
  try {
    let last = '';
    ticker = setInterval(() => {
      try {
        const done = fs.statSync(dest).size;
        const pct = file.size ? ` ${Math.min(99, Math.round((done / file.size) * 100))}%` : '';
        const t = `📥 Downloading *${name}* (${label})${pct} · ${mb(done)}`;
        if (t !== last) { last = t; editStatus(sock, chat, status, t); }
      } catch { /* file not created yet */ }
    }, 15000);
    ticker.unref?.();

    let lastErr = null; let ok = false;
    for (const url of ia.downloadUrls(item, file)) {          // primary, then the item's own server
      try { await downloadToFile(url, dest, maxBytes); ok = true; break; }
      catch (e) { lastErr = e; try { fs.unlinkSync(dest); } catch {} }
    }
    if (!ok) throw lastErr || new Error('download failed');
    clearInterval(ticker); ticker = null;

    const size = fs.statSync(dest).size;
    await editStatus(sock, chat, status, `📤 Uploading *${name}* (${label} · ${mb(size)})…`);
    const asDoc = !file.playable || size > getDocThresholdBytes();   // big files → document (reliable up to 2 GB)
    const fileName = `${safeName(`${name} ${label}`)}.${file.ext}`;
    const mimetype = MIME[file.ext] || 'application/octet-stream';
    await sock.sendMessage(chat, asDoc
      ? { document: { url: dest }, mimetype, fileName, caption }
      : { video: { url: dest }, mimetype: 'video/mp4', fileName, caption }, { quoted: msg });
    await editStatus(sock, chat, status, `✅ Sent *${name}* (${label})`);
  } finally {
    if (ticker) clearInterval(ticker);
    try { fs.unlinkSync(dest); } catch {}                      // always free the disk
  }
}

function enqueue(sock, chat, msg, job) {
  if (queue.pending || queue.size) {
    sock.sendMessage(chat, { text: `⏳ Queued — ${queue.size + queue.pending} download(s) ahead of you.` }, { quoted: msg }).catch(() => {});
  }
  return queue.add(() => fetchAndSend(sock, chat, msg, job));
}

// ── step 1: search ───────────────────────────
async function startSearch(sock, chat, msg, kind, query, extra = {}) {
  const status = await sock.sendMessage(chat, { text: `🔍 Searching *${query}*…` }, { quoted: msg });
  let results;
  try { results = await ia.searchTitles(query, kind, 5); }
  catch (e) {
    await editStatus(sock, chat, status, `❌ ${ia.SOURCE_NAME} is not answering right now (${e.message}). Try again in a minute.`);
    return;
  }
  if (!results.length) {
    await editStatus(sock, chat, status, `❌ Nothing found for *${query}*.\n_This source only has public-domain and freely licensed ${kind === 'series' ? 'shows' : 'films'} — try an older or simpler title._`);
    return;
  }
  const token = newSession({ stage: 'title', kind, chat, query, results, ...extra });
  const what = kind === 'series' ? (extra.full ? 'full series' : `episode ${extra.ep}`) : 'movie';
  await askChoice(sock, chat, msg,
    `🎬 *${query}* — top ${results.length} (${what})\n_Source: ${ia.SOURCE_NAME}, public-domain & free titles_\n\nPick one:`,
    results.map((r, i) => ({ label: `${r.title}${r.year ? ` (${r.year})` : ''}`, cmd: `mvp ${token} ${i + 1}` })));
}

export const movie = safe('movie', async (sock, chat, msg, args) => {
  const query = ia.cleanQuery(args.join(' '));
  if (!query) {
    return reply(sock, chat, msg, `🎬 *Movie downloader*\n\n• \`${P()}movie <name>\` — search, pick, choose quality, get the file\n• \`${P()}series <name> -ep 11\` — one episode\n• \`${P()}series <name> -full\` — whole series, 3 episodes per batch, then \`${P()}continue\`\n• \`${P()}movieinfo <name>\` — ratings & plot\n\n${limitsLine()}\n_Free source: ${ia.SOURCE_NAME} (public-domain & freely licensed titles)._`);
  }
  await startSearch(sock, chat, msg, 'movie', query);
});

export const series = safe('series', async (sock, chat, msg, args) => {
  const text = args.join(' ');
  const epM = /(?:^|\s)--?(?:ep|e|episode)\s*[:=]?\s*(\d{1,4})\b/i.exec(text);
  const full = /(?:^|\s)--?full\b/i.test(text);
  const name = ia.cleanQuery(text.replace(/(?:^|\s)--?full\b/ig, ' ').replace(/(?:^|\s)--?(?:ep|e|episode)\s*[:=]?\s*\d{1,4}\b/ig, ' '));
  if (!name || (!epM && !full)) {
    return reply(sock, chat, msg, `📺 *Series downloader*\n\n• \`${P()}series <name> -ep 11\` — one episode\n• \`${P()}series <name> -full\` — all episodes (3 per batch, then \`${P()}continue\`)\n\n${limitsLine()}`);
  }
  await startSearch(sock, chat, msg, 'series', name, epM ? { ep: Number(epM[1]), full: false } : { ep: 0, full: true });
});

// legacy info lookup, untouched (modules/media.js)
export const movieinfo = safe('movieinfo', async (sock, chat, msg, args) => {
  const m = await import('./media.js');
  return m.movieCommand(sock, chat, msg, args);
});

// ── step 2: a title was picked ───────────────
export const mvp = safe('mvp', async (sock, chat, msg, args) => {
  const s = getSession(args[0], chat);
  if (!s || s.stage !== 'title') return expired(sock, chat, msg);
  const pick = s.results[(Number(args[1]) || 0) - 1];
  if (!pick) return reply(sock, chat, msg, '❌ Invalid choice.');
  if (s.busy) return;
  s.busy = true;
  try {
    const status = await sock.sendMessage(chat, { text: `📂 Loading *${pick.title}*…` }, { quoted: msg });
    let item;
    try { item = await ia.getItem(pick.id); }
    catch (e) { return editStatus(sock, chat, status, `❌ ${e.message}`); }
    const videos = ia.videoFiles(item.files);
    if (!videos.length) return editStatus(sock, chat, status, '❌ That title has no downloadable video file. Try another result.');
    const title = pick.title;

    if (s.kind === 'movie') {
      await promptQuality(sock, chat, msg, { kind: 'movie', item, title, name: title, files: videos });
      return;
    }

    const eps = ia.groupEpisodes(videos);
    if (!eps.size) return editStatus(sock, chat, status, '❌ Could not tell the episodes apart in that title. Try another result.');

    if (!s.full) {
      const files = eps.get(s.ep);
      if (!files) {
        const nums = [...eps.keys()];
        return editStatus(sock, chat, status, `❌ Episode ${s.ep} is not in *${title}*.\n_It has ${nums.length} episode(s): ${nums[0]}–${nums[nums.length - 1]}. Try another result or episode._`);
      }
      await promptQuality(sock, chat, msg, { kind: 'series', item, title, name: `${title} E${String(s.ep).padStart(2, '0')}`, files, caption: `📺 ${title} — Episode ${s.ep}` });
      return;
    }

    // -full: pick the best quality per episode that fits .dlcap, then run batches of 3
    const limits = { maxBytes: getMaxDownloadBytes(), maxHeight: getVideoHeight() };
    const plan = []; const skipped = [];
    for (const [ep, files] of eps) {
      const pickQ = ia.autoPick(files, limits);
      if (pickQ) plan.push({ ep, ...pickQ }); else skipped.push(ep);
    }
    if (!plan.length) {
      return editStatus(sock, chat, status, `❌ No episode of *${title}* fits your limits (${getMaxDownloadMB()} MB · ${getVideoHeight()}p).\nRaise them with \`${P()}dlcap 1gb\` / \`${P()}dlcap quality 720\`.`);
    }
    const total = plan.reduce((a, p) => a + (p.file.size || 0), 0);
    const run = { chat, item, title, plan, next: 0, busy: false, at: Date.now() };
    runs.set(chat, run);
    await editStatus(sock, chat, status,
      `📺 *${title}* — ${eps.size} episode(s), ${plan.length} fit your limits${total ? ` (≈ ${mb(total)} in total)` : ''}.` +
      `${skipped.length ? `\n⚠️ Skipped (too big / too high quality): ${skipped.join(', ')}` : ''}\n\nSending ${Math.min(BATCH, plan.length)} now, \`${P()}continue\` for more.`);
    sessions.delete(String(args[0]).toLowerCase());
    await runBatch(sock, chat, msg, run);
  } finally { s.busy = false; }
});

/** Quality prompt (or straight download when only one quality exists). */
async function promptQuality(sock, chat, msg, ctx) {
  const options = ia.qualityOptions(ctx.files);
  if (!options.length) return reply(sock, chat, msg, '❌ No usable quality found.');
  if (options.length === 1) return startDownload(sock, chat, msg, ctx, options[0]);
  const token = newSession({ stage: 'quality', chat, ctx, options });
  await askChoice(sock, chat, msg,
    `🎞️ *${ctx.name}*\nChoose a quality (${ctx.title}):\n${limitsLine()}`,
    options.map((o, i) => ({ label: `${o.label} · ${mb(o.file.size)}${capProblem(o.file) ? ' ⛔' : ''}`, cmd: `mvq ${token} ${i + 1}` })));
}

// ── step 3: a quality was picked ─────────────
export const mvq = safe('mvq', async (sock, chat, msg, args) => {
  const s = getSession(args[0], chat);
  if (!s || s.stage !== 'quality') return expired(sock, chat, msg);
  const opt = s.options[(Number(args[1]) || 0) - 1];
  if (!opt) return reply(sock, chat, msg, '❌ Invalid choice.');
  if (s.busy) return;
  s.busy = true;
  try { await startDownload(sock, chat, msg, s.ctx, opt); } finally { s.busy = false; }
});

async function startDownload(sock, chat, msg, ctx, opt) {
  const problem = capProblem(opt.file);
  if (problem) return reply(sock, chat, msg, `⛔ *${opt.label}* can't be downloaded: ${problem}`);
  try {
    await enqueue(sock, chat, msg, {
      item: ctx.item, file: opt.file, name: ctx.name, label: opt.label,
      caption: ctx.caption || `🎬 ${ctx.title} — ${opt.label}\n${FOOTER}`,
    });
  } catch (e) {
    await reply(sock, chat, msg, `⚠️ Download failed: ${e.message}${/larger|cap|exceed/i.test(e.message) ? `\n_Raise the cap with_ \`${P()}dlcap 1gb\`` : ''}`);
  }
}

// ── series batches ───────────────────────────
async function runBatch(sock, chat, msg, run) {
  if (run.busy) return reply(sock, chat, msg, '⏳ A batch is already running — wait for it to finish.');
  run.busy = true; run.at = Date.now();
  const done = []; const failed = [];
  try {
    for (let i = 0; i < BATCH && run.next < run.plan.length; i++) {
      const p = run.plan[run.next];
      try {
        await enqueue(sock, chat, msg, {
          item: run.item, file: p.file, name: `${run.title} E${String(p.ep).padStart(2, '0')}`, label: p.label,
          caption: `📺 ${run.title} — Episode ${p.ep} (${p.label})\n${FOOTER}`,
        });
        done.push(p.ep);
      } catch (e) {
        failed.push(p.ep);
        await reply(sock, chat, msg, `⚠️ Episode ${p.ep} failed: ${e.message}`);
      }
      run.next += 1;
    }
  } finally { run.busy = false; }

  const left = run.plan.length - run.next;
  let text = `📺 *${run.title}* — sent ${done.length ? `episode(s) ${done.join(', ')}` : 'nothing'}${failed.length ? ` · failed: ${failed.join(', ')}` : ''}.`;
  if (left > 0) text += `\n\n${left} episode(s) left. Send \`${P()}continue\` for the next ${Math.min(BATCH, left)}.`;
  else { text += '\n\n✅ That was the last one.'; runs.delete(chat); }
  await reply(sock, chat, msg, text);
}

export const continueCmd = safe('continue', async (sock, chat, msg) => {
  prune();
  const run = runs.get(chat);
  if (!run) return reply(sock, chat, msg, `ℹ️ Nothing to continue here. Start with \`${P()}series <name> -full\`.`);
  await runBatch(sock, chat, msg, run);
});
export { continueCmd as continue_ };
