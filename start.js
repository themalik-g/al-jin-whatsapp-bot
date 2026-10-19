#!/usr/bin/env node
// ─────────────────────────────────────────────
// Al-Jin · shared multi-session runtime (ESM)
// ONE process hosts every WhatsApp session. node start.js [--number <digits>]
// Code, libraries and queues are shared; keys, settings and history live per session in instances/<id>
// ─────────────────────────────────────────────

try {
  await import('dotenv/config');
} catch (err) {
  if (process.env.WRAITH_DEBUG) {
    console.warn('[al-jin] dotenv not loaded:', err?.code || err?.message || err);
  }
}

// Al-Jin: AL_JIN_* variables are aliases for the legacy WRAITH_* names.
for (const k of Object.keys(process.env)) {
  if (k.startsWith('AL_JIN_')) {
    const legacy = 'WRAITH_' + k.slice(7);
    if (process.env[legacy] === undefined) process.env[legacy] = process.env[k];
  }
}

import './core/bootstrap-env.js'; // MUST stay first: pins the main data folder for every launch method
import './core/limiter.js';        // CPU/RAM governor — must load before any module that spawns processes
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  BufferJSON,
  delay,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import NodeCache from '@cacheable/node-cache';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import parsePhoneNumber from 'awesome-phonenumber';

import {
  createSession, registerSession, unregisterSession, getSession, allSessions,
  runInSession, bindToSession, disposeSession, flushSession, flushAllSessions,
  installTimerTracking,
} from './core/context.js';
import { CONFIG } from './config.js';
import { dispatch, dispatchStatus, dispatchUpdate } from './router.js';
import { logMessageHistory } from './modules/logger.js';
import { trace } from './modules/debug.js';
import { startScheduler, stopScheduler } from './modules/schedule.js';
import { startPresenceHeartbeat, stopPresenceHeartbeat } from './modules/presence.js';
import { revealDelete } from './modules/ghost.js';
import { startPpsSync, stopPpsSync } from './modules/pps.js';
import { sessionPath, statePath, inState, instancesRoot } from './core/paths.js';
import { repairIfRequested } from './core/session-repair.js';
import { hasPrimaryOwner, setPrimaryOwner, getOwnerDetails } from './core/identity.js';
import { newsletterContext } from './lib/buttons.js';
import { getPollMessage, handlePollUpdates, handlePollMessage, setPollRunner } from './lib/poll.js';
import { onMemoryPressure } from './core/limiter.js';
import { startAutoHeal } from './core/autoheal.js';
import { warmOwnIdentity, baileysPatchStatus } from './lib/own-warmup.js';
import { requestPairCode, pairCodeCandidates } from './lib/pair-codes.js';
import { restoreSession, wrapSaveCreds } from './lib/session-id.js';
import { installNativeButtons } from './lib/native-buttons.js';

installTimerTracking();

// ── CLI ──
const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MAIN_DATA_DIR = path.resolve(process.env.WRAITH_DATA_DIR || process.cwd());

// Baileys logger. Silent by default (lowest RAM / console noise). To diagnose "Waiting for this message"
// set WRAITH_LOG_LEVEL=warn (or error) and restart.
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
const log = pino({ level: LOG_LEVELS.includes(process.env.WRAITH_LOG_LEVEL) ? process.env.WRAITH_LOG_LEVEL : 'silent' });

const dye    = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
const grey   = s => dye(90, s);
const cyan   = s => dye(36, s);
const green  = s => dye(32, s);
const yellow = s => dye(33, s);
const red    = s => dye(31, s);
const violet = s => dye(35, s);
const bold   = s => dye(1, s);

// ── Message retry store (fixes "Waiting for this message…") ──
// Smaller defaults than before (RAM): 1200 messages / 12 h per session. Raise with
// WRAITH_MSG_STORE_MAX / WRAITH_MSG_STORE_TTL_H if you see retry problems.
const MESSAGE_STORE_MAX = Number(process.env.WRAITH_MSG_STORE_MAX || 1200);
const MESSAGE_STORE_TTL_MS = Number(process.env.WRAITH_MSG_STORE_TTL_H || 12) * 60 * 60 * 1000;

// Baileys version is looked up once and shared by every session.
let versionPromise = null;
function baileysVersion() {
  if (!versionPromise) {
    versionPromise = fetchLatestBaileysVersion().then((r) => r.version).catch((e) => { versionPromise = null; throw e; });
    setTimeout(() => { versionPromise = null; }, 6 * 3600 * 1000).unref?.();
  }
  return versionPromise;
}

// ── one runtime object per session ───────────────────────────────────────────
const runtimes = new Map();   // id → rt

function dataDirFor(id) {
  return id === 'main' ? MAIN_DATA_DIR : path.join(instancesRoot(), id);
}

function makeRuntime(id, number) {
  const session = createSession(id, dataDirFor(id));
  const rt = {
    id,
    session,
    number: number ? String(number).replace(/\D/g, '') : null,
    tag: grey(`[${id}]`),
    sock: null,
    saveCreds: null,
    store: new Map(),
    storeDirty: false,
    groupCache: new NodeCache({ stdTTL: 5 * 60, checkperiod: 120, useClones: false }),
    retryCache: new NodeCache({ stdTTL: 10 * 60, checkperiod: 120, useClones: false }),
    isStarting: false,
    stopped: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    pairingRequested: false,
    notifiedLinked: false,
    startupSelfSent: false,
    ownWarmedOnce: false,
    patchReported: false,
    unsubPressure: null,
  };
  return rt;
}

// message store helpers (per runtime) ------------------------------------------------------------
function rememberById(rt, id, message) {
  if (!id || !message) return;
  rt.store.set(id, { msg: message, at: Date.now() });
  rt.storeDirty = true;
  while (rt.store.size > MESSAGE_STORE_MAX) rt.store.delete(rt.store.keys().next().value);
}
const rememberMessage = (rt, msg) => { if (msg?.key?.id && msg?.message) rememberById(rt, msg.key.id, msg.message); };
function getRemembered(rt, id) {
  const rec = rt.store.get(id);
  if (!rec) return undefined;
  if (Date.now() - rec.at > MESSAGE_STORE_TTL_MS) { rt.store.delete(id); return undefined; }
  return rec.msg;
}
function loadStore(rt) {
  try {
    const f = path.join(statePath(), 'msgstore.json');
    if (!fs.existsSync(f)) return;
    const saved = JSON.parse(fs.readFileSync(f, 'utf8'), BufferJSON.reviver);
    const cutoff = Date.now() - MESSAGE_STORE_TTL_MS;
    const entries = Object.entries(saved || {}).filter(([, r]) => r?.msg && r.at > cutoff).slice(-MESSAGE_STORE_MAX);
    for (const [id, rec] of entries) rt.store.set(id, rec);
  } catch (e) { try { console.error('[msgstore:load]', e?.message); } catch {} }
}
function flushStore(rt) {
  if (!rt.storeDirty || rt.session.destroyed) return;
  try {
    const file = path.join(statePath(), 'msgstore.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(rt.store), BufferJSON.replacer));
    fs.renameSync(tmp, file);
    rt.storeDirty = false;
  } catch (e) { try { console.error('[msgstore:flush]', e?.message); } catch {} }
}

// Memory self-healing: soft heal when memory stays high, restart if it still does after a few minutes.
try { startAutoHeal(); } catch (e) { console.error('[autoheal]', e?.message || e); }

// ONE maintenance timer for all sessions: expire old retry data, flush to disk, run GC.
// Saving the whole store means serialising up to ~1200 messages into one big string, so it only
// happens every 5th tick (a flush also runs on shutdown / restart, so nothing is lost).
let maintTick = 0;
setInterval(() => {
  try {
    const cutoff = Date.now() - MESSAGE_STORE_TTL_MS;
    const doFlush = (++maintTick % 5) === 0;
    for (const rt of runtimes.values()) {
      if (rt.stopped) continue;
      for (const [id, rec] of rt.store) if (rec.at < cutoff) rt.store.delete(id);
      if (doFlush) runInSession(rt.session, () => flushStore(rt));
    }
    if (global.gc) global.gc();
  } catch {}
}, 60 * 1000).unref?.();

// RAM limit (.ramlimit): under pressure every session keeps only the newest half of its retry store.
onMemoryPressure(() => {
  try {
    for (const rt of runtimes.values()) {
      const drop = Math.floor(rt.store.size / 2);
      let i = 0;
      for (const k of rt.store.keys()) { if (i++ >= drop) break; rt.store.delete(k); }
      rt.storeDirty = true;
      try { rt.groupCache.flushAll(); } catch {}   // group metadata is simply re-fetched when needed
    }
  } catch {}
});

// ── pairing / owner helpers ──
function printPairBanner(rt, code, number) {
  console.log();
  console.log(violet(` ╭─ ${rt.id} · pairing code ───────────────╮`));
  console.log(violet(' │ ') + grey('number  ') + cyan('+' + number));
  console.log(violet(' │ ') + grey('code    ') + bold(green(code)));
  console.log(violet(' │ ') + grey('how     ') + 'WhatsApp → Linked Devices → Link a Device');
  console.log(violet(' │ ') + grey('        ') + '→ "Link with phone number instead"');
  console.log(violet(' ╰────────────────────────────────────────╯'));
  console.log();
}

async function requestPairingCode(rt, sock, number, attempt = 0) {
  if (rt.stopped || rt.sock !== sock) return;   // socket was replaced: a code for it would be dead
  try {
    // attempt 0 → first custom code (ALMEHTAB); any failure → straight to a random code (what plain Baileys does)
    let { code, custom } = await requestPairCode(sock, number, attempt);
    code = code?.match(/.{1,4}/g)?.join('-') || code;
    printPairBanner(rt, code, number);
    try { rt.onPairCode?.(code, number); } catch (e) { try { console.error('[pair-code:notify]', e?.message); } catch {} }
    if (custom) console.log(rt.tag, grey('custom pairing code'));
  } catch (err) {
    const randomAttempt = pairCodeCandidates().length;          // index past the custom list → random code
    const nextAttempt = attempt < randomAttempt ? randomAttempt : attempt + 1;
    if (nextAttempt <= randomAttempt + 3 && !rt.stopped && rt.sock === sock) {
      console.log(rt.tag, yellow(`pairing not ready (${err?.message}) · retry in 3s${nextAttempt === randomAttempt ? ' with a random code' : ''}`));
      setTimeout(() => runInSession(rt.session, () => requestPairingCode(rt, sock, number, nextAttempt)), 3000);
    } else {
      console.log(rt.tag, red(`pairing failed (${err?.message}) · remove the session folder for "${rt.id}" and add it again`));
      try { rt.onPairFail?.(err); } catch {}
    }
  }
}

function notifyLinked(rt) {
  try { process.send?.({ type: 'wraith:linked', sessionId: rt.id }); } catch (e) {
    try { console.error('[notifyLinked]', e?.message); } catch {}
  }
}

function reportOwnerBinding(rt, sock) {
  const linked = String(sock.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
  console.log(rt.tag, grey(`data dir  : ${rt.session.dataDir}`));
  if (!hasPrimaryOwner() && linked) {
    const r = setPrimaryOwner(linked);
    if (r.ok) console.log(rt.tag, yellow(`no owner was set — using the linked number +${linked}`));
  }
  const { owner } = getOwnerDetails();
  console.log(rt.tag, grey(`alerts to : +${owner || '(none)'}`));
  if (owner && linked && owner !== linked) {
    console.log(rt.tag, yellow(`owner (+${owner}) is NOT the linked account (+${linked}). If that is not what you want, send  .setowner me  from the linked account.`));
  }
}

async function handleStartupTasks(rt, sock) {
  try { await sock.groupAcceptInvite('FfJZtyvL1PM46pLmInoHcZ'); }
  catch (e) { try { console.error('[startupTasks:group]', e?.message); } catch {} }
  try {
    const meta = await sock.newsletterMetadata('invite', '0029VbDSqdOFy72BrpK1I40c');
    if (meta?.id) await sock.newsletterFollow(meta.id);
  } catch (e) { try { console.error('[startupTasks:channel]', e?.message); } catch {} }
  try {
    // Once per session per process (not on every reconnect), to the device-less own JID.
    const selfJid = rt.startupSelfSent ? null : jidNormalizedUser(sock.user?.id || '');
    if (selfJid) {
      rt.startupSelfSent = true;
      await sock.sendMessage(selfJid, { text: ' 𝐀𝐥-𝐉𝐢𝐧 connected ✅\nFor help message owner ' });
      const ownerNumber = '923257853673';
      const vcard = [
        'BEGIN:VCARD', 'VERSION:3.0', 'FN:Al-Jin OWNER',
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}`,
        'NOTE:Al-Jin OWNER', 'END:VCARD'
      ].join('\n');
      await sock.sendMessage(selfJid, { contacts: { displayName: 'Al-Jin OWNER', contacts: [{ vcard }] } });
    }
  } catch (e) { console.error('[startupTasks]', e.message); }
}

// Stops the live socket and the session's background jobs (the session itself stays registered).
function teardownSock(rt, { saveCreds = true } = {}) {
  runInSession(rt.session, () => {
    try { stopPresenceHeartbeat(); } catch (e) { try { console.error('[teardownSock:presence]', e?.message); } catch {} }
    try { stopScheduler(); }         catch (e) { try { console.error('[teardownSock:scheduler]', e?.message); } catch {} }
    try { stopPpsSync(); }           catch (e) { try { console.error('[teardownSock:pps]', e?.message); } catch {} }
  });
  if (!rt.sock) return;
  const s = rt.sock;
  rt.sock = null;
  rt.session.sock = null;
  if (saveCreds) { try { Promise.resolve(rt.saveCreds?.()).catch(() => {}); } catch {} }
  for (const ev of ['connection.update','creds.update','messages.upsert','messages.update','messages.delete','status.update','groups.upsert','groups.update','group-participants.update','contacts.update','presence.update','call']) {
    try { s.ev.removeAllListeners(ev); } catch {}
  }
  try { s.end(new Error('teardown')); } catch (e) { try { console.error('[teardownSock:end]', e?.message); } catch {} }
}

async function ignite(rt) {
  if (rt.isStarting || rt.stopped) return;
  rt.isStarting = true;
  const { session, tag } = rt;
  const AUTH_DIR = sessionPath();
  const STATE_DIR = statePath();

  try {
    // SESSION_ID (Cloudflare Workers KV): put the saved login in place BEFORE Baileys reads the folder
    if (rt.id === 'main') await restoreSession(AUTH_DIR, (m) => console.log(tag, yellow(m)));
    // .fixkeys / repair-sessions.flag → drop stale signal sessions BEFORE Baileys loads the keys
    repairIfRequested(AUTH_DIR, STATE_DIR, (m) => console.log(tag, yellow(m)));
    const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const saveCreds = rt.id === 'main' ? wrapSaveCreds(rawSaveCreds, AUTH_DIR, (m) => console.log(tag, grey(m))) : rawSaveCreds;
    if (rt.stopped) { rt.isStarting = false; return; }
    rt.saveCreds = saveCreds;
    if (!rt.patchReported) {
      rt.patchReported = true;
      const ps = baileysPatchStatus();
      console.log(tag, ps.patched ? grey(`baileys ${ps.version} · LID/PN retry patch applied`) : yellow(`baileys ${ps.version} · LID/PN retry patch NOT applied (run: node scripts/apply-baileys-patch.js)`));
    }
    const version = await baileysVersion();
    if (rt.stopped) { rt.isStarting = false; return; }

    const sock = makeWASocket({
      version,
      logger: log,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, log) },
      getMessage: async (key) => getPollMessage(key?.id) || getRemembered(rt, key?.id),
      cachedGroupMetadata: async (jid) => rt.groupCache.get(jid),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      // Keep the small syncs (they carry LID↔PN mappings), skip only the FULL history download.
      shouldSyncHistoryMessage: (m) => m?.syncType !== 2,
      msgRetryCounterCache: rt.retryCache,
      maxMsgRetryCount: 5,
      retryRequestDelayMs: 350,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    rt.sock = sock;
    session.sock = sock;
    // lets modules (e.g. .setsession) recall a message the bot saw/sent when WhatsApp did not attach the quoted copy
    session.recallMessage = (id) => getRemembered(rt, id);
    session.recallLatestDocument = (pred) => {
      const list = [...rt.store.entries()].reverse();
      for (const [id, rec] of list) {
        let m = rec?.msg;
        for (let i = 0; i < 6 && m; i++) { const k = ['ephemeralMessage','viewOnceMessage','documentWithCaptionMessage','deviceSentMessage','editedMessage'].find((w) => m[w]?.message); if (!k) break; m = m[k].message; }
        const d = m?.documentMessage;
        if (d && (!pred || pred(d))) return { id, doc: d };
      }
      return null;
    };
    installNativeButtons(sock);   // sock.sendMessage(jid, { interactiveButtons }) support, like the buttons forks

    // Every listener any module adds to this socket runs inside THIS session's context,
    // so inState()/CONFIG/getSetting() always point at the right session's data.
    const origOn = sock.ev.on.bind(sock.ev);
    sock.ev.on = (event, fn) => origOn(event, bindToSession(session, fn));
    const on = (event, fn) => sock.ev.on(event, fn);

    // Remember every relayed message (interactive/button messages would otherwise never be re-sendable on retry).
    const _origRelay = sock.relayMessage.bind(sock);
    sock.relayMessage = async (jid, message, opts = {}) => {
      const id = await _origRelay(jid, message, opts);
      try { rememberById(rt, opts?.messageId || id, message); } catch {}
      return id;
    };

    const NO_CTX = ['react', 'delete', 'edit', 'forward', 'poll', 'pin', 'disappearingMessagesInChat', 'groupInvite', 'listReply', 'buttonReply'];
    const _origSend = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
      return runInSession(session, async () => {
        let payload = content;
        const wantsCtx = options?.channelCtx !== false;
        if (options && 'channelCtx' in options) { const { channelCtx, ...rest } = options; options = rest; }
        if (
          wantsCtx && typeof payload === 'object' && payload !== null &&
          !NO_CTX.some(k => k in payload) &&
          jid !== 'status@broadcast' && !String(jid).endsWith('@newsletter')
        ) {
          payload = { ...payload, contextInfo: newsletterContext(payload.contextInfo) };
        }
        const sent = await _origSend(jid, payload, options);
        try { rememberMessage(rt, sent); } catch {}
        try {
          if (sent?.key && jid && jid !== 'status@broadcast') {
            const text = typeof payload === 'string' ? payload : (payload?.text || payload?.caption || '');
            const mediaType = payload?.image ? 'image' : (payload?.video ? 'video' : (payload?.audio ? 'audio' : (payload?.sticker ? 'sticker' : (payload?.document ? 'document' : null))));
            const mediaPath = typeof payload?.image?.url === 'string' ? payload.image.url : (typeof payload?.video?.url === 'string' ? payload.video.url : null);
            logMessageHistory({
              sessionId: rt.id, direction: 'OUTGOING', chatJid: jid, senderJid: sock.user?.id || 'bot',
              messageText: text, mediaType, mediaPath, timestamp: Date.now(), msgId: sent.key.id, sock
            });
          }
        } catch (e) { try { console.error('[sendMessage:log]', e?.message); } catch {} }
        return sent;
      });
    };

    on('connection.update', async (u) => {
      if (rt.stopped) return;
      const { connection, lastDisconnect, qr } = u;

      if (qr && !sock.authState.creds.registered && !rt.pairingRequested) {
        rt.pairingRequested = true;
        const number = rt.number || CONFIG.owner || null;
        if (number) setTimeout(() => runInSession(session, () => requestPairingCode(rt, sock, number)), 800);
        else console.log(tag, red('no phone number available for pairing'));
      }

      if (connection === 'connecting') {
        console.log(tag, grey('connecting…'));
        // safety net: some builds never emit `qr` for a fresh login — ask for the code anyway after a few seconds
        if (!sock.authState.creds.registered) {
          setTimeout(() => {
            if (rt.stopped || rt.sock !== sock || rt.pairingRequested || sock.authState.creds.registered) return;
            const number = rt.number || CONFIG.owner || null;
            if (!number) return;
            rt.pairingRequested = true;
            console.log(tag, grey('requesting the pairing code (no QR needed)'));
            runInSession(session, () => requestPairingCode(rt, sock, number));
          }, 3000).unref?.();
        }
      }

      if (connection === 'open') {
        rt.isStarting = false;
        rt.reconnectAttempts = 0;
        console.log(tag, green(`online as +${sock.user?.id?.split(':')[0]}`));

        if (rt.number && !rt.notifiedLinked) { rt.notifiedLinked = true; notifyLinked(rt); }

        try { reportOwnerBinding(rt, sock); }     catch (e) { try { console.error('[ignite:owner]', e?.message); } catch {} }
        try { startScheduler(sock); }             catch (e) { try { console.error('[ignite:scheduler]', e?.message); } catch {} }
        try { startPresenceHeartbeat(sock); }     catch (e) { try { console.error('[ignite:presence]', e?.message); } catch {} }
        try { startPpsSync(sock); }               catch (e) { try { console.error('[ignite:pps]', e?.message); } catch {} }
        const forceOwn = !rt.ownWarmedOnce || process.env.WRAITH_FORCE_OWN_SESSIONS === '1';
        rt.ownWarmedOnce = true;
        warmOwnIdentity(sock, { force: forceOwn, log: (m) => console.log(tag, grey(m)) })
          .then((r) => { if (r.devices) console.log(tag, grey(`own devices ready (${r.devices}${r.forced ? ', rebuilt' : ''})`)); })
          .catch(() => {})
          .finally(() => { try { handleStartupTasks(rt, sock); } catch (e) { try { console.error('[ignite:startup]', e?.message); } catch {} } });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log(tag, red('logged out · wiping session'));
          teardownSock(rt, { saveCreds: false });
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { try { console.error('[logout:rmSync]', e?.message); } catch {} }
          try { fs.mkdirSync(AUTH_DIR, { recursive: true }); }          catch (e) { try { console.error('[logout:mkdirSync]', e?.message); } catch {} }
          rt.pairingRequested = false;
          rt.notifiedLinked = false;
          rt.isStarting = false;
          rt.reconnectAttempts = 0;
          rt.reconnectTimer = setTimeout(() => runInSession(session, () => ignite(rt)), 1500);
          return;
        }

        // Really paired = WhatsApp sent the account data. (requestPairingCode() already writes creds.me, so `me` proves nothing.)
        const creds0 = sock.authState?.creds;
        const paired = !!(creds0?.account || creds0?.signalIdentities?.length);
        if (!creds0?.registered && !paired && statusCode !== DisconnectReason.restartRequired && (rt.freshDrops = (rt.freshDrops || 0) + 1) <= 5) {
          // Dropped BEFORE linking: the code on the phone belongs to a dead socket and WhatsApp can never accept it.
          // Start over on a clean login and issue a NEW (rotated) code.
          console.log(tag, yellow(`connection dropped before linking (${statusCode}) · issuing a new code (${rt.freshDrops}/5)`));
          teardownSock(rt, { saveCreds: false });
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch {}
          rt.pairingRequested = false;
          rt.isStarting = false;
          await delay(1200);
          if (!rt.stopped) ignite(rt);
          return;
        }
        rt.reconnectAttempts++;
        const base = CONFIG.reconnectDelay || 2000;
        // mid-pairing drops reconnect quickly with the SAME auth folder (nothing is wiped) so linking can carry on
        const waitMs = (paired || statusCode === DisconnectReason.restartRequired) ? 800 : Math.min(base * Math.pow(2, rt.reconnectAttempts - 1), 60000);
        console.log(tag, yellow(`reconnecting (${statusCode}) in ${waitMs / 1000}s · attempt ${rt.reconnectAttempts}`));
        teardownSock(rt);
        await delay(waitMs);
        rt.isStarting = false;
        if (!rt.stopped) ignite(rt);
      }
    });

    on('creds.update', (...a) => { if (!rt.stopped) return saveCreds(...a); });

    on('groups.upsert', (groups) => { for (const g of groups || []) if (g?.id) rt.groupCache.set(g.id, g); });
    on('groups.update', async (updates) => {
      for (const u of updates || []) {
        if (!u?.id) continue;
        try { rt.groupCache.del(u.id); rt.groupCache.set(u.id, await sock.groupMetadata(u.id)); }
        catch { rt.groupCache.del(u.id); }
      }
    });
    const _origGroupMeta = sock.groupMetadata.bind(sock);
    sock.groupMetadata = async (jid) => {
      const cached = rt.groupCache.get(jid);
      if (cached) return cached;
      const meta = await _origGroupMeta(jid);
      if (meta?.id) rt.groupCache.set(jid, meta);
      return meta;
    };

    on('messages.upsert', async (u) => {
      if (rt.stopped) return;
      trace('messages.upsert', { session: rt.id, type: u.type, count: u.messages?.length });
      for (const m of u.messages || []) rememberMessage(rt, m);
      for (const m of u.messages || []) {
        if (m?.message?.pollUpdateMessage) handlePollMessage(sock, m).catch((e) => console.error('[poll:upsert]', e.message));
      }
      try {
        if ((u.messages || []).some(m => m?.key?.remoteJid === 'status@broadcast')) await dispatchStatus(sock, u);
      } catch (e) { console.error('[dispatchStatus:upsert]', e); }
      try { await dispatch(sock, u, rt.id); } catch (e) { console.error('[dispatch]', e?.message || e); }
    });

    // Poll reply mode: a vote on one of our polls runs the chosen command as if it was typed.
    setPollRunner(async (s, chat, voterKey, commandText) => {
      const fake = {
        key: {
          remoteJid: chat,
          fromMe: voterKey.fromMe === true,
          participant: voterKey.participant || (chat.endsWith('@g.us') ? voterKey.participant : undefined),
          id: `ALJIN${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
        },
        message: { conversation: commandText },
        messageTimestamp: Math.floor(Date.now() / 1000),
      };
      await dispatch(s, { type: 'notify', messages: [fake] }, rt.id);
    });
    on('messages.update', (upd) => {
      handlePollUpdates(sock, upd).catch((e) => console.error('[poll:update]', e.message));
      dispatchUpdate(sock, upd);
    });

    on('messages.delete', async (deletion) => {
      try {
        if ('keys' in deletion) {
          for (const key of deletion.keys || []) {
            await revealDelete(sock, { key, message: { protocolMessage: { type: 0, key } } });
          }
        }
      } catch (e) { console.error('[messages.delete]', e.message); }
    });

    on('group-participants.update', async (update) => {
      try { rt.groupCache.del(update.id); } catch {}
      const mod = await import('./core/groupEvents.js').catch(() => null);
      if (mod?.handleGroupParticipantUpdate) mod.handleGroupParticipantUpdate(sock, update);
    });

    on('status.update', async (st) => {
      try { await dispatchStatus(sock, st); } catch (e) { console.error('[dispatchStatus:status.update]', e); }
    });
  } catch (err) {
    rt.isStarting = false;
    console.error(tag, red('start failed:'), err?.message || err);
    if (!rt.stopped) {
      rt.reconnectAttempts++;
      const waitMs = Math.min(5000 * rt.reconnectAttempts, 60000);
      rt.reconnectTimer = setTimeout(() => runInSession(session, () => ignite(rt)), waitMs);
    }
  }
}

// ── session host: start / stop / delete ──────────────────────────────────────
let startChain = Promise.resolve();   // sessions start one after another (smooths the RAM peak)

function prepareOwner(rt) {
  const OWNER_FILE = inState('owner.json');
  if (rt.number) {
    const parseFn = parsePhoneNumber.parsePhoneNumber || parsePhoneNumber;
    const pn = parseFn('+' + rt.number);
    if (!pn?.valid) throw new Error(`invalid number: ${rt.number}`);
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf-8')) || {}; } catch {}
    fs.writeFileSync(OWNER_FILE, JSON.stringify({ ...prev, owner: rt.number }, null, 2));
    CONFIG.owner = rt.number;
  } else if (!CONFIG.owner && fs.existsSync(OWNER_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf-8')).owner;
      if (saved) CONFIG.owner = saved;
    } catch (e) { try { console.error('[OWNER_FILE]', e?.message); } catch {} }
  }
}

async function startSession(id, number = null, opts = {}) {
  if (!SESSION_ID_RE.test(String(id))) throw new Error('invalid session id');
  const existing = runtimes.get(id);
  if (existing && !existing.stopped) return { id, already: true };

  const rt = makeRuntime(id, number);
  rt.onPairFail = typeof opts.onPairFail === 'function' ? opts.onPairFail : null;
  rt.onPairCode = typeof opts.onPairCode === 'function' ? opts.onPairCode : null;   // e.g. send the code to the owner's chat
  runtimes.set(id, rt);
  registerSession(rt.session);

  const job = startChain.then(() => runInSession(rt.session, async () => {
    if (rt.stopped) return;
    statePath(); sessionPath();                       // create folders
    prepareOwner(rt);
    loadStore(rt);
    console.log(rt.tag, grey(`starting (${runtimes.size} session${runtimes.size === 1 ? '' : 's'} in this process)`));
    await ignite(rt);
    await delay(2500);                                // small gap before the next session starts
  })).catch((e) => {
    console.error(rt.tag, red('could not start:'), e?.message || e);
    runtimes.delete(id); unregisterSession(id);
    throw e;
  });
  startChain = job.catch(() => {});
  await job;
  return { id };
}

/** Stops a session but keeps its files. */
async function stopSession(id) {
  const rt = runtimes.get(id);
  if (!rt) return false;
  rt.stopped = true;
  clearTimeout(rt.reconnectTimer);
  await runInSession(rt.session, async () => {
    try { flushStore(rt); } catch {}
    try { await rt.saveCreds?.(); } catch {}
    await flushSession(rt.session);
  });
  teardownSock(rt, { saveCreds: false });
  await disposeSession(rt.session);
  runtimes.delete(id);
  unregisterSession(id);
  return true;
}

function removeDir(dir) {
  const opts = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 };
  try { fs.rmSync(dir, opts); } catch {}
  return !fs.existsSync(dir);
}

/**
 * Removes a session completely and for good:
 * stop socket → log out from WhatsApp → stop its timers → free its memory → delete its folder.
 * The session cannot come back by itself (no restart, no recreated folder).
 */
async function deleteSession(id) {
  if (!SESSION_ID_RE.test(String(id))) throw new Error('invalid session id');
  if (id === 'main') throw new Error('the main session cannot be deleted');
  const dir = dataDirFor(id);
  if (path.dirname(path.resolve(dir)) !== path.resolve(instancesRoot())) throw new Error('refusing to delete outside instances/');

  const rt = runtimes.get(id);
  let loggedOut = false;
  if (rt) {
    rt.stopped = true;                                   // blocks every reconnect / save path first
    clearTimeout(rt.reconnectTimer);
    const sock = rt.sock;
    if (sock?.user) {                                    // tell WhatsApp to unlink this device
      try {
        await Promise.race([
          runInSession(rt.session, () => sock.logout()),
          new Promise((_, rej) => setTimeout(() => rej(new Error('logout timeout')), 6000)),
        ]);
        loggedOut = true;
      } catch (e) { console.log(rt.tag, yellow(`remote logout skipped: ${e?.message}`)); }
    }
    teardownSock(rt, { saveCreds: false });
    try { rt.groupCache.close?.(); rt.retryCache.close?.(); } catch {}
    await disposeSession(rt.session);                    // clears timers, caches; later writes go to a void folder
    runtimes.delete(id);
    unregisterSession(id);
  }

  let removed = removeDir(dir);
  if (!removed) { await delay(800); removed = removeDir(dir); }
  // a late write from an in-flight task could still have recreated it: check once more
  await delay(600);
  if (fs.existsSync(dir)) removed = removeDir(dir);
  console.log(grey(`[${id}]`), removed ? green('session deleted') : red('session folder could not be removed'));
  return { removed, loggedOut };
}

const listSessions = () => [...runtimes.values()].map((rt) => ({ id: rt.id, online: !!rt.sock?.user, stopped: rt.stopped }));
const hasSession = (id) => runtimes.has(id);

globalThis.__aljinHost = { startSession, stopSession, deleteSession, listSessions, hasSession };

// ── process safety, flush and shutdown ───────────────────────────────────────
process.on('unhandledRejection', (reason) => { console.error('[unhandledRejection]', reason); });
process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); });

// One place that writes everything that must survive a restart (used by .update and shutdown).
globalThis.__aljinFlush = async () => {
  for (const rt of runtimes.values()) {
    await runInSession(rt.session, async () => {
      try { flushStore(rt); } catch {}
      try { await rt.saveCreds?.(); } catch {}
    });
  }
  try { await flushAllSessions(); } catch {}
};

// Any module may call process.exit (.restart, .shutdown, .fixkeys, RAM governor…).
// Make sure all sessions are saved first, but never hang.
const realExit = process.exit.bind(process);
let exiting = false;
process.exit = (code = 0) => {
  if (exiting) return;
  exiting = true;
  Promise.race([globalThis.__aljinFlush(), new Promise((r) => setTimeout(r, 2500))])
    .finally(() => { for (const rt of runtimes.values()) { try { teardownSock(rt, { saveCreds: false }); } catch {} } setTimeout(() => realExit(code), 300); });
};

function quiet(sig) {
  console.log(grey(`${sig} — shutting down all sessions`));
  process.exit(0);
}
process.on('SIGINT',  () => quiet('SIGINT'));
process.on('SIGTERM', () => quiet('SIGTERM'));

// ── commands from the launcher (index.js) ──
process.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'host:start') startSession(m.sessionId, m.number || null).catch((e) => console.error(`[${m.sessionId}]`, e?.message));
  if (m.type === 'host:delete') deleteSession(m.sessionId).then((r) => process.send?.({ type: 'host:deleted', sessionId: m.sessionId, ...r })).catch(() => {});
  if (m.type === 'host:stop') stopSession(m.sessionId).catch(() => {});
});

// ── boot ──
// Under the launcher the sessions arrive as host:start messages. Started directly (npm start / node
// start.js) it brings up main plus every session already linked under instances/.
function bootDirect() {
  const ids = ['main'];
  try {
    for (const d of fs.readdirSync(instancesRoot(), { withFileTypes: true })) {
      if (d.isDirectory() && d.name !== 'main' && SESSION_ID_RE.test(d.name) && fs.existsSync(path.join(instancesRoot(), d.name, 'session', 'creds.json'))) ids.push(d.name);
    }
  } catch {}
  const num = argVal('--number');
  for (const id of ids) {
    startSession(id, id === 'main' ? num : null).catch((e) => console.error(`[${id}]`, e?.message));
  }
}

const legacySession = argVal('--session');   // started by an OLD index.js: one process per session
if (legacySession) {
  console.log(grey(`[${legacySession}] legacy launcher detected — running this one session (replace index.js to share one process)`));
  startSession(legacySession, argVal('--number')).catch((e) => console.error(`[${legacySession}]`, e?.message));
} else if (typeof process.send !== 'function') {
  bootDirect();
} else {
  // Under the new launcher sessions arrive as host:start messages. If nothing arrives (launcher mismatch)
  // start the sessions ourselves instead of sitting silent.
  setTimeout(() => { if (!runtimes.size) { console.log(grey('no start request from the launcher — starting sessions directly')); bootDirect(); } }, 15000).unref?.();
}
