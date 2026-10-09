// ─────────────────────────────────────────────
//  Al-Jin · modules/x-movie.js
//  Movie & series downloader with Moviebox SDK (primary) + Internet Archive fallback.
//
//    .movie <name>                  top 5 → pick one → download + send
//    .series <name> -ep 1           top 5 → pick show → one episode
//    .series <name> -full           top 5 → pick show → 3 episodes per batch, then .continue
//    .continue                      next 3 episodes of the last -full run in this chat
//    .movieinfo <title>             ratings & plot lookup
//
//  Streams straight into Baileys (lib/stream-send.js): no download-to-disk step, flat RAM,
//  no transcoding. Obeys .dlcap AND the free disk. One transfer at a time.
//  Titles: keyword clean-up + fuzzy ranking, plus Groq/Gemini when a key is set (lib/title-resolver.js).
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import PQueue from 'p-queue';
import { reply, prefix, safe } from '../lib/x.js';
import { sendWithCta, createQuickReply } from '../lib/buttons.js';
import { inPollRun } from '../lib/poll.js';
import { editStatus } from '../lib/reaction-helper.js';
import {
  getMaxDownloadMB, getMaxDownloadBytes, getVideoHeight, getDocThresholdBytes, fmtMB,
} from '../core/limits.js';
import * as ia from '../lib/ia-movies.js';
import {
  searchMoviebox,
  getMovieboxMovieStream,
  getMovieboxSeriesDetails,
  getMovieboxEpisodeStream,
  normalizeItem,
  getSeasons,
} from '../lib/moviebox.js';
import { openRemote, openHls, sendStream, effectiveCapBytes, purgeLeftovers } from '../lib/stream-send.js';
import { resolveQuery, rankResults, aiConfigured } from '../lib/title-resolver.js';

const queue = new PQueue({ concurrency: 1 });          // one download at a time
const SESSION_TTL = 15 * 60 * 1000;
const RUN_TTL = 3 * 60 * 60 * 1000;
const BATCH = 3;                                        // episodes per batch
const PAGE = 5;                                         // titles per button page ("➡️ More" shows the next ones)
const MAX_TITLES = 25;                                  // max titles kept per search
const sxe = (s, e) => `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
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

/** Why a file may not be sent under the current .dlcap / free disk — '' when it is fine. */
function capProblem(file, capBytes = getMaxDownloadBytes()) {
  if (file.size && file.size > capBytes) {
    return capBytes < getMaxDownloadBytes()
      ? `${mb(file.size)} will not fit: only ~${fmtMB(capBytes)} MB of server disk is free (WhatsApp needs one temporary encrypted copy). Pick a lower quality.`
      : `${mb(file.size)} is above your download cap (${getMaxDownloadMB()} MB). Raise it with \`${P()}dlcap 1gb\` or pick a lower quality.`;
  }
  const h = file.bucket || 480;
  if (h > getVideoHeight()) {
    return `${h}p is above your max quality (${getVideoHeight()}p). Raise it with \`${P()}dlcap quality ${h}\` or pick a lower quality.`;
  }
  return '';
}

// ── stream → WhatsApp (shared by both sources) ──
async function pumpToWhatsApp(sock, chat, msg, status, { name, label = '', open, asDoc, mimetype, fileName, caption }) {
  purgeLeftovers();
  const cap = await effectiveCapBytes();
  if (cap < 20 * 1024 * 1024) throw new Error('The server disk is almost full — free some space and try again.');
  const { stream, size } = await open(cap);
  const doc = typeof asDoc === 'function' ? asDoc(size) : asDoc;
  const tag = label ? ` (${label})` : '';
  let ticker = null; let last = ''; const t0 = Date.now();
  try {
    const paint = () => {
      const done = stream.bytes || 0;
      const pct = size ? ` ${Math.min(99, Math.round((done / size) * 100))}%` : '';
      const sp = done / 1048576 / Math.max(1, (Date.now() - t0) / 1000);
      const t = `📥 Streaming *${name}*${tag}${pct} · ${mb(done)}${size ? ` / ${mb(size)}` : ''} · ${sp.toFixed(1)} MB/s`;
      if (t !== last) { last = t; editStatus(sock, chat, status, t); }
    };
    await editStatus(sock, chat, status, `📥 Streaming *${name}*${tag}${size ? ` · ${mb(size)}` : ''} — straight to WhatsApp, no copy kept…`);
    ticker = setInterval(paint, 8000); ticker.unref?.();
    stream.once('end', () => { clearInterval(ticker); ticker = null; editStatus(sock, chat, status, `📤 Uploading *${name}*${tag} (${mb(stream.bytes)})…`); });
    await sendStream(sock, chat, msg, { stream, asDoc: doc, mimetype, fileName, caption });
    await editStatus(sock, chat, status, `✅ Sent *${name}*${tag}`);
  } finally {
    if (ticker) clearInterval(ticker);
    try { stream.destroy(); } catch {}
  }
}

// ── Moviebox ─────────────────────────────────
async function fetchAndSendMoviebox(sock, chat, msg, { streamObj, name, caption }) {
  const status = await sock.sendMessage(chat, { text: `🔎 Preparing *${name}*…` }, { quoted: msg });
  try {
    const url = typeof streamObj === 'string' ? streamObj : streamObj?.stream?.url || streamObj?.url;
    const headers = (typeof streamObj === 'object' && (streamObj?.headers || streamObj?.stream?.headers)) || {};
    if (!url) throw new Error('No valid stream URL');
    const hls = url.includes('.m3u8');
    await pumpToWhatsApp(sock, chat, msg, status, {
      name,
      open: (cap) => (hls ? openHls(url, { headers, maxBytes: cap }) : openRemote(url, { headers, maxBytes: cap })),
      asDoc: (size) => hls || size > getDocThresholdBytes(),   // HLS comes out as fragmented MP4 → send as a document so it always opens
      mimetype: 'video/mp4',
      fileName: `${safeName(name)}.mp4`,
      caption,
    });
  } catch (err) {
    await editStatus(sock, chat, status, `❌ Failed: ${err.message}`);
    throw err;
  }
}

// ── Internet Archive ─────────────────────────
async function fetchAndSendIA(sock, chat, msg, { item, file, name, label, caption }) {
  const status = await sock.sendMessage(chat, { text: `🔎 Preparing *${name}* (${label})…` }, { quoted: msg });
  try {
    const asDoc = !file.playable || (file.size || 0) > getDocThresholdBytes();   // big files → document (reliable up to 2 GB)
    let lastErr = null;
    const urls = ia.downloadUrls(item, file);                                     // primary, then the item's own server
    await pumpToWhatsApp(sock, chat, msg, status, {
      name, label,
      open: async (cap) => {
        for (const u of urls) {
          try { return await openRemote(u, { maxBytes: cap }); }
          catch (e) { lastErr = e; if (/MB is more than/.test(e.message)) break; }
        }
        throw lastErr || new Error('source not reachable');
      },
      asDoc,
      mimetype: asDoc ? (MIME[file.ext] || 'application/octet-stream') : 'video/mp4',
      fileName: `${safeName(`${name} ${label}`)}.${file.ext}`,
      caption,
    });
  } catch (err) {
    await editStatus(sock, chat, status, `❌ Failed: ${err.message}`);
    throw err;
  }
}

function enqueue(sock, chat, msg, job) {
  if (queue.pending || queue.size) {
    sock.sendMessage(chat, { text: `⏳ Queued — ${queue.size + queue.pending} download(s) ahead of you.` }, { quoted: msg }).catch(() => {});
  }
  return queue.add(() => job.source === 'moviebox'
    ? fetchAndSendMoviebox(sock, chat, msg, job)
    : fetchAndSendIA(sock, chat, msg, job));
}

// ── step 1: search ───────────────────────────
/** Shows one page of the result list (+ a "More" button when there are further titles). */
async function sendTitlePage(sock, chat, msg, token, s) {
  const total = s.results.length;
  const from = s.offset || 0;
  const page = s.results.slice(from, from + PAGE);
  const left = total - (from + page.length);
  const what = s.kind === 'series' ? (s.full ? 'full series' : `S${String(s.season || 1).padStart(2, '0')}E${String(s.ep).padStart(2, '0')}`) : 'movie';
  const sources = [...new Set(s.results.map((r) => r.source))];
  const sourceLabel = sources.map((k) => (k === 'moviebox' ? 'Moviebox' : `${ia.SOURCE_NAME} (public domain)`)).join(' + ');
  const options = page.map((r, i) => ({
    label: `${r.title}${r.year ? ` (${r.year})` : ''}${r.source === 'ia' && sources.length > 1 ? ' · IA' : ''}`,
    cmd: `mvp ${token} ${from + i + 1}`,
  }));
  if (left > 0) options.push({ label: `➡️ More results (${left} left)`, cmd: `mvm ${token}` });
  await askChoice(sock, chat, msg,
    `🎬 *${s.query}* — ${from + 1}-${from + page.length} of ${total} (${what})\n_Source: ${sourceLabel}_\n${s.note ? `${s.note}\n` : ''}\nPick one:`,
    options);
}

async function startSearch(sock, chat, msg, kind, query, extra = {}) {
  const status = await sock.sendMessage(chat, { text: `🔍 Searching *${query}*…` }, { quoted: msg });
  const rq = await resolveQuery(query, kind);                       // keyword clean-up (+ Groq/Gemini if a key is set)
  if (rq.by || rq.shown !== query.toLowerCase()) {
    await editStatus(sock, chat, status, `🔍 Searching *${rq.shown}*${rq.year ? ` (${rq.year})` : ''}${rq.by ? ` _· matched by ${rq.by}_` : ''}…`);
  }
  const wanted = rq.wanted || query;

  // 1. Moviebox — all spelling variants at once, every result page, merged + deduplicated
  const variants = rq.variants.slice(0, 4);
  const settled = await Promise.allSettled(variants.map((v) => searchMoviebox(v, kind)));
  const mbDown = settled.length > 0 && settled.every((r) => r.status === 'rejected');
  for (const r of settled) if (r.status === 'rejected') console.warn('[moviebox search error]:', r.reason?.message || r.reason);
  const mbSeen = new Set(); const mbList = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const raw of r.value || []) {
      const n = normalizeItem(raw);
      const k = String(n.detailPath || `${n.title}|${n.year}`);
      if (!n.detailPath || mbSeen.has(k)) continue;
      mbSeen.add(k);
      mbList.push({ title: n.title, detailPath: n.detailPath, year: n.year, source: 'moviebox', raw: n.raw });
    }
  }
  const mb = rankResults(mbList, wanted, rq.year);

  // 2. Internet Archive (public domain) — added only when Moviebox has few / weak matches
  let iaRanked = { results: [], top: 0 }; let iaErr = null;
  if (mb.results.length < 3 || mb.top < 0.6) {
    const iaSeen = new Set(); const iaList = [];
    for (const v of rq.variants.slice(0, 3)) {
      try {
        for (const r of (await ia.searchTitles(v, kind, 8)) || []) {
          if (iaSeen.has(r.id)) continue;
          iaSeen.add(r.id); iaList.push({ title: r.title, id: r.id, year: r.year, source: 'ia', raw: r });
        }
        if (rankResults(iaList, wanted, rq.year).top >= 0.6) break;
      } catch (e) { iaErr = e; break; }
    }
    iaRanked = rankResults(iaList, wanted, rq.year);
  }

  // Moviebox first (it has the real catalogue); Internet Archive first only if it clearly matches better
  const groups = iaRanked.top > mb.top + 0.2 ? [iaRanked.results, mb.results] : [mb.results, iaRanked.results];
  const results = groups.flat().slice(0, MAX_TITLES);

  if (!results.length) {
    if (iaErr && mbDown) {
      await editStatus(sock, chat, status, `❌ Search unavailable (${iaErr.message}). Try again in a minute.`);
      return;
    }
    await editStatus(sock, chat, status,
      `❌ Nothing found for *${rq.shown || query}*.${mbDown ? '\n_Moviebox did not answer — check the bot log for "[moviebox search error]"._' : ''}` +
      `\nTry just the main words (no quality or year).${aiConfigured() ? '' : `\n💡 _Add a free key for smart title matching:_ \`${P()}setvar GROQ_API_KEY <key>\` _or_ \`GEMINI_API_KEY\``}`);
    return;
  }

  const hasMb = results.some((r) => r.source === 'moviebox');
  const note = !hasMb ? `⚠️ _${mbDown ? 'Moviebox did not respond' : 'Moviebox has no match'} — showing public-domain titles only._` : '';
  const shownQuery = rq.shown || query;
  const token = newSession({ stage: 'title', kind, chat, query: shownQuery, results, offset: 0, note, ...extra });
  await sendTitlePage(sock, chat, msg, token, sessions.get(token));
}

/** "➡️ More results" button → next page of the same search. */
export const mvm = safe('mvm', async (sock, chat, msg, args) => {
  const token = String(args[0] || '').toLowerCase();
  const s = getSession(token, chat);
  if (!s || s.stage !== 'title') return expired(sock, chat, msg);
  s.offset = (s.offset || 0) + PAGE;
  if (s.offset >= s.results.length) s.offset = 0;
  await sendTitlePage(sock, chat, msg, token, s);
});

export const movie = safe('movie', async (sock, chat, msg, args) => {
  const query = ia.cleanQuery(args.join(' '));
  if (!query) {
    return reply(sock, chat, msg, `🎬 *Movie downloader*\n\n• \`${P()}movie <name>\` — search, pick, get the movie\n• \`${P()}series <name> -ep 1\` — one episode\n• \`${P()}series <name> -full\` — whole series, 3 episodes per batch, then \`${P()}continue\`\n• \`${P()}movieinfo <name>\` — ratings & plot\n\n${limitsLine()}`);
  }
  await startSearch(sock, chat, msg, 'movie', query);
});

export const series = safe('series', async (sock, chat, msg, args) => {
  const text = args.join(' ');
  const epM = /(?:^|\s)--?(?:ep|e|episode)\s*[:=]?\s*(\d{1,4})\b/i.exec(text);
  const full = /(?:^|\s)--?full\b/i.test(text);
  const seasonM = /(?:^|\s)--?(?:s|season)\s*[:=]?\s*(\d{1,3})\b/i.exec(text);
  const name = ia.cleanQuery(text.replace(/(?:^|\s)--?(?:s|season)\s*[:=]?\s*\d{1,3}\b/ig, ' ').replace(/(?:^|\s)--?full\b/ig, ' ').replace(/(?:^|\s)--?(?:ep|e|episode)\s*[:=]?\s*\d{1,4}\b/ig, ' '));
  if (!name || (!epM && !full)) {
    return reply(sock, chat, msg, `📺 *Series downloader*\n\n• \`${P()}series <name> -ep 1\` — one episode (season 1)\n• \`${P()}series <name> -s 2 -ep 5\` — season 2, episode 5\n• \`${P()}series <name> -full\` — all seasons (3 per batch, then \`${P()}continue\`)\n• \`${P()}series <name> -s 2 -full\` — one whole season\n\n${limitsLine()}`);
  }
  const season = seasonM ? Number(seasonM[1]) : 0;
  await startSearch(sock, chat, msg, 'series', name, epM ? { ep: Number(epM[1]), full: false, season } : { ep: 1, full: true, season });
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

    // --- MOVIEBOX PATH ---
    if (pick.source === 'moviebox') {
      if (s.kind === 'movie') {
        let streamObj;
        try {
          streamObj = await getMovieboxMovieStream(pick.detailPath, 'best');
        } catch (e) {
          return editStatus(sock, chat, status, `❌ Could not load stream from Moviebox (${e.message}).`);
        }

        sessions.delete(String(args[0]).toLowerCase());
        await enqueue(sock, chat, msg, {
          source: 'moviebox',
          streamObj,
          name: pick.title,
          caption: `🎬 ${pick.title}\n${FOOTER}`,
        });
        return;
      }

      // Series in Moviebox
      if (s.kind === 'series') {
        let details;
        try {
          details = await getMovieboxSeriesDetails(pick.detailPath);
        } catch (e) {
          return editStatus(sock, chat, status, `❌ Could not load series details (${e.message}).`);
        }
        const seasons = getSeasons(details);
        const season = s.season || 1;
        if (seasons.length && !seasons.some((x) => x.season === season)) {
          return editStatus(sock, chat, status, `❌ Season ${season} is not in *${pick.title}*.\n_Available seasons: ${seasons.map((x) => x.season).join(', ')}._`);
        }

        const requestedEp = s.ep || 1;
        if (!s.full) {
          let epStream;
          try {
            epStream = await getMovieboxEpisodeStream(pick.detailPath, season, requestedEp, 'best');
          } catch (e) {
            return editStatus(sock, chat, status, `❌ Could not load ${sxe(season, requestedEp)} (${e.message}).`);
          }

          sessions.delete(String(args[0]).toLowerCase());
          await enqueue(sock, chat, msg, {
            source: 'moviebox',
            streamObj: epStream,
            name: `${pick.title} ${sxe(season, requestedEp)}`,
            caption: `📺 ${pick.title} — Season ${season} Episode ${requestedEp}\n${FOOTER}`,
          });
          return;
        }

        // -full: every season (or just the one asked with -s)
        const plan = [];
        for (const se of (seasons.length ? seasons : [{ season: 1, episodes: 0 }])) {
          if (s.season && se.season !== s.season) continue;
          const n = se.episodes || 10;                       // count unknown → try 10, failures are reported
          for (let ep = 1; ep <= n; ep++) plan.push({ season: se.season, ep, detailPath: pick.detailPath });
        }
        const run = { chat, source: 'moviebox', title: pick.title, plan, next: 0, busy: false, at: Date.now() };
        runs.set(chat, run);
        await editStatus(sock, chat, status,
          `📺 *${pick.title}* — ${seasons.length > 1 ? `${seasons.length} seasons, ` : ''}${plan.length} episode(s) found.\n\nSending ${Math.min(BATCH, plan.length)} now, \`${P()}continue\` for more.`);
        sessions.delete(String(args[0]).toLowerCase());
        await runBatchMoviebox(sock, chat, msg, run);
        return;
      }
    }

    // --- INTERNET ARCHIVE PATH ---
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

    // -full IA: pick the best quality per episode that fits .dlcap, then run batches of 3
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
    const run = { chat, source: 'ia', item, title, plan, next: 0, busy: false, at: Date.now() };
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
  const room = await effectiveCapBytes();
  const token = newSession({ stage: 'quality', chat, ctx, options });
  await askChoice(sock, chat, msg,
    `🎞️ *${ctx.name}*\nChoose a quality (${ctx.title}):\n${limitsLine()}${room < getMaxDownloadBytes() ? `\n_Server disk allows ≤ ${fmtMB(room)} MB per file right now_` : ''}`,
    options.map((o, i) => ({ label: `${o.label} · ${mb(o.file.size)}${capProblem(o.file, room) ? ' ⛔' : ''}`, cmd: `mvq ${token} ${i + 1}` })));
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
  const problem = capProblem(opt.file, await effectiveCapBytes());
  if (problem) return reply(sock, chat, msg, `⛔ *${opt.label}* can't be downloaded: ${problem}`);
  try {
    await enqueue(sock, chat, msg, {
      source: 'ia',
      item: ctx.item, file: opt.file, name: ctx.name, label: opt.label,
      caption: ctx.caption || `🎬 ${ctx.title} — ${opt.label}\n${FOOTER}`,
    });
  } catch (e) {
    await reply(sock, chat, msg, `⚠️ Download failed: ${e.message}${/larger|cap|exceed/i.test(e.message) ? `\n_Raise the cap with_ \`${P()}dlcap 1gb\`` : ''}`);
  }
}

// ── series batches ───────────────────────────
async function runBatchMoviebox(sock, chat, msg, run) {
  if (run.busy) return reply(sock, chat, msg, '⏳ A batch is already running — wait for it to finish.');
  run.busy = true; run.at = Date.now();
  const done = []; const failed = [];
  try {
    for (let i = 0; i < BATCH && run.next < run.plan.length; i++) {
      const p = run.plan[run.next];
      try {
        const epStream = await getMovieboxEpisodeStream(p.detailPath, p.season || 1, p.ep, 'best');
        await enqueue(sock, chat, msg, {
          source: 'moviebox',
          streamObj: epStream,
          name: `${run.title} ${sxe(p.season || 1, p.ep)}`,
          caption: `📺 ${run.title} — Season ${p.season || 1} Episode ${p.ep}\n${FOOTER}`,
        });
        done.push(sxe(p.season || 1, p.ep));
      } catch (e) {
        failed.push(sxe(p.season || 1, p.ep));
        await reply(sock, chat, msg, `⚠️ ${sxe(p.season || 1, p.ep)} failed: ${e.message}`);
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

async function runBatch(sock, chat, msg, run) {
  if (run.source === 'moviebox') return runBatchMoviebox(sock, chat, msg, run);
  if (run.busy) return reply(sock, chat, msg, '⏳ A batch is already running — wait for it to finish.');
  run.busy = true; run.at = Date.now();
  const done = []; const failed = [];
  try {
    for (let i = 0; i < BATCH && run.next < run.plan.length; i++) {
      const p = run.plan[run.next];
      try {
        await enqueue(sock, chat, msg, {
          source: 'ia',
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
