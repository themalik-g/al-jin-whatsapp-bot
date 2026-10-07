#!/usr/bin/env node
// ─────────────────────────────────────────────
// Al-Jin · per-session bootstrap worker (ESM)
// node start.js --session <id> [--number <digits>]
// Code loads from repo root; all session data lives in WRAITH_DATA_DIR (instances/<id>)
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

import './core/bootstrap-env.js'; // MUST stay first: pins one data folder for every launch method
import './core/limiter.js';        // CPU/RAM governor — must load before any module that spawns processes
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  BufferJSON,
  delay
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import NodeCache from '@cacheable/node-cache';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import parsePhoneNumber from 'awesome-phonenumber';

import { CONFIG } from './config.js';
import { dispatch, dispatchStatus, dispatchUpdate } from './router.js';
import { logMessageHistory } from './modules/logger.js';
import { trace } from './modules/debug.js';
import { startScheduler, stopScheduler } from './modules/schedule.js';
import { startPresenceHeartbeat, stopPresenceHeartbeat } from './modules/presence.js';
import { revealDelete } from './modules/ghost.js';
import { startPpsSync, stopPpsSync } from './modules/pps.js';
import { sessionPath, statePath, inState } from './core/paths.js';
import { loadVars } from './core/vars.js';
import { hasPrimaryOwner, setPrimaryOwner, getOwnerDetails } from './core/identity.js';
import { newsletterContext } from './lib/buttons.js';
import { getPollMessage, handlePollUpdates, handlePollMessage, setPollRunner } from './lib/poll.js';
import { onMemoryPressure } from './core/limiter.js';

// ── CLI Arg Parsing ──
const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};

const sessionId     = argVal('--session') || process.env.WRAITH_SESSION_ID || 'main';
const rawNumber     = argVal('--number');
const pairingNumber = rawNumber ? rawNumber.replace(/\D/g, '') : null;

// ── Per-Session Path Resolution ──
const AUTH_DIR   = sessionPath();
const STATE_DIR  = statePath();
const OWNER_FILE = inState('owner.json');

// Ensure persistent session vars (such as GEMINI_API_KEY) are initialized into process.env
try {
  loadVars();
} catch (e) {
  if (process.env.WRAITH_DEBUG) console.warn('[start.js] loadVars error:', e.message);
}

if (pairingNumber) {
  const parseFn = parsePhoneNumber.parsePhoneNumber || parsePhoneNumber;
  const pn = parseFn('+' + pairingNumber);
  if (!pn?.valid) {
    console.error(`[${sessionId}] invalid number: ${rawNumber}`);
    process.exit(1);
  }
  let prevOwnerData = {};
  try { prevOwnerData = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf-8')) || {}; } catch {}
  fs.writeFileSync(OWNER_FILE, JSON.stringify({ ...prevOwnerData, owner: pairingNumber }, null, 2));
  CONFIG.owner = pairingNumber;
} else if (!CONFIG.owner && fs.existsSync(OWNER_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf-8')).owner;
    if (saved) CONFIG.owner = saved;
  } catch (e) {
    try { console.error('[OWNER_FILE]', e?.message); } catch {}
  }
}

// Baileys logger. Silent by default (lowest RAM / console noise). To diagnose "Waiting for this message"
// or decrypt problems set  WRAITH_LOG_LEVEL=warn  (or error) in your panel's environment and restart:
// Baileys then prints "failed to decrypt message" / "Bad MAC" / "No session" lines you can send for analysis.
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

const tag = grey(`[${sessionId}]`);

// ── Persistent Message Store (fixes "Waiting for this message…") ──
// WhatsApp asks us to re-send a message when a device fails to decrypt it.
// getMessage() must be able to return that message, otherwise the recipient
// is stuck on "Waiting for this message. This may take a while."
// The store survives restarts (JSON on disk) and holds far more history.
const MESSAGE_STORE = new Map();
const MESSAGE_STORE_MAX = Number(process.env.WRAITH_MSG_STORE_MAX || 3000);
const MESSAGE_STORE_TTL_MS = Number(process.env.WRAITH_MSG_STORE_TTL_H || 24) * 60 * 60 * 1000;
const STORE_FILE = path.join(STATE_DIR, 'msgstore.json');
let storeDirty = false;

try {
  if (fs.existsSync(STORE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'), BufferJSON.reviver);
    const cutoff = Date.now() - MESSAGE_STORE_TTL_MS;
    for (const [id, rec] of Object.entries(saved || {})) {
      if (rec?.msg && rec.at > cutoff) MESSAGE_STORE.set(id, rec);
    }
  }
} catch (e) {
  try { console.error('[msgstore:load]', e?.message); } catch {}
}

function rememberById(id, message) {
  if (!id || !message) return;
  MESSAGE_STORE.set(id, { msg: message, at: Date.now() });
  storeDirty = true;
  while (MESSAGE_STORE.size > MESSAGE_STORE_MAX) {
    MESSAGE_STORE.delete(MESSAGE_STORE.keys().next().value);
  }
}

function rememberMessage(msg) {
  if (!msg?.key?.id || !msg?.message) return;
  rememberById(msg.key.id, msg.message);
}

function getRememberedMessage(id) {
  const rec = MESSAGE_STORE.get(id);
  if (!rec) return undefined;
  if (Date.now() - rec.at > MESSAGE_STORE_TTL_MS) {
    MESSAGE_STORE.delete(id);
    return undefined;
  }
  return rec.msg;
}

// RAM limit (.ramlimit): under memory pressure keep only the newest half of the retry store.
onMemoryPressure(() => {
  try {
    const drop = Math.floor(MESSAGE_STORE.size / 2);
    let i = 0;
    for (const k of MESSAGE_STORE.keys()) { if (i++ >= drop) break; MESSAGE_STORE.delete(k); }
    storeDirty = true;
  } catch {}
});

function flushStore() {
  if (!storeDirty) return;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(MESSAGE_STORE), BufferJSON.replacer));
    fs.renameSync(tmp, STORE_FILE);
    storeDirty = false;
  } catch (e) {
    try { console.error('[msgstore:flush]', e?.message); } catch {}
  }
}

setInterval(() => {
  try {
    const cutoff = Date.now() - MESSAGE_STORE_TTL_MS;
    for (const [id, rec] of MESSAGE_STORE) {
      if (rec.at < cutoff) MESSAGE_STORE.delete(id);
    }
    flushStore();
    if (global.gc) global.gc();
  } catch {}
}, 30 * 1000).unref?.();

// Retry counters must outlive a full retry cycle (no tiny maxKeys / 60s TTL).
const msgRetryCounterCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120, useClones: false });
// Group metadata cache: avoids re-fetching on every send and keeps the
// participant list (sender-key distribution) accurate in groups.
const groupCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 120, useClones: false });

function printPairBanner(code, number) {
  console.log();
  console.log(violet(` ╭─ ${sessionId} · pairing code ───────────────╮`));
  console.log(violet(' │ ') + grey('number  ') + cyan('+' + number));
  console.log(violet(' │ ') + grey('code    ') + bold(green(code)));
  console.log(violet(' │ ') + grey('how     ') + 'WhatsApp → Linked Devices → Link a Device');
  console.log(violet(' │ ') + grey('        ') + '→ "Link with phone number instead"');
  console.log(violet(' ╰────────────────────────────────────────╯'));
  console.log();
}

async function requestPairingCode(sock, number, attempt = 0) {
  try {
    let code = await sock.requestPairingCode(number);
    code = code?.match(/.{1,4}/g)?.join('-') || code;
    printPairBanner(code, number);
  } catch (err) {
    if (attempt < 4) {
      console.log(tag, yellow(`pairing not ready (${err.message}) · retry ${attempt + 1}/4 in 5s`));
      setTimeout(() => requestPairingCode(sock, number, attempt + 1), 5000);
    } else {
      console.log(tag, red(`pairing failed · delete ${AUTH_DIR} and restart`));
    }
  }
}

function notifyLinked() {
  try { process.send?.({ type: 'wraith:linked', sessionId }); } catch (e) {
    try { console.error('[notifyLinked]', e?.message); } catch {}
  }
}

// Prints where data lives and who receives alerts; binds an owner if none is set.
function reportOwnerBinding(sock) {
  const linked = String(sock.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
  console.log(tag, grey(`data dir  : ${process.env.WRAITH_DATA_DIR}`));
  if (!hasPrimaryOwner() && linked) {
    const r = setPrimaryOwner(linked);
    if (r.ok) console.log(tag, yellow(`no owner was set — using the linked number +${linked}`));
  }
  const { owner } = getOwnerDetails();
  console.log(tag, grey(`alerts to : +${owner || '(none)'}`));
  if (owner && linked && owner !== linked) {
    console.log(tag, yellow(`owner (+${owner}) is NOT the linked account (+${linked}). If that is not what you want, send  .setowner me  from the linked account.`));
  }
}

async function handleStartupTasks(sock) {
  try {
    await sock.groupAcceptInvite('FfJZtyvL1PM46pLmInoHcZ');
  } catch (e) {
    try { console.error('[startupTasks:group]', e?.message); } catch {}
  }
  try {
    const meta = await sock.newsletterMetadata('invite', '0029VbDSqdOFy72BrpK1I40c');
    if (meta?.id) {
      await sock.newsletterFollow(meta.id);
    }
  } catch (e) {
    try { console.error('[startupTasks:channel]', e?.message); } catch {}
  }
  try {
    const selfJid = sock.user?.id;
    if (selfJid) {
      await sock.sendMessage(selfJid, {
        text: ' 𝐀𝐥-𝐉𝐢𝐧 connected ✅\nFor help message owner '
      });
      const ownerNumber = '923257853673';
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Al-Jin OWNER',
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}`,
        'NOTE:Al-Jin OWNER',
        'END:VCARD'
      ].join('\n');
      await sock.sendMessage(selfJid, {
        contacts: {
          displayName: 'Al-Jin OWNER',
          contacts: [{ vcard }]
        }
      });
    }
  } catch (e) {
    console.error('[startupTasks]', e.message);
  }
}

let isStarting = false;
let currentSock = null;
let reconnectAttempts = 0;
let pairingRequested = false;
let notifiedLinked = false;

function teardownSock() {
  try { stopPresenceHeartbeat(); } catch (e) { try { console.error('[teardownSock:presence]', e?.message); } catch {} }
  try { stopScheduler(); }         catch (e) { try { console.error('[teardownSock:scheduler]', e?.message); } catch {} }
  try { stopPpsSync(); }           catch (e) { try { console.error('[teardownSock:pps]', e?.message); } catch {} }
  if (!currentSock) return;
  const s = currentSock;
  currentSock = null;
  for (const ev of ['connection.update','creds.update','messages.upsert','messages.update','messages.delete','status.update']) {
    try { s.ev.removeAllListeners(ev); } catch (e) { try { console.error('[teardownSock:'+ev+']', e?.message); } catch {} }
  }
  try { s.end(new Error('teardown')); } catch (e) { try { console.error('[teardownSock:end]', e?.message); } catch {} }
}

async function ignite() {
  if (isStarting) return;
  isStarting = true;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: log,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, log)
    },
    getMessage: async (key) => getPollMessage(key?.id) || getRememberedMessage(key?.id),
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    msgRetryCounterCache,
    maxMsgRetryCount: 5,
    retryRequestDelayMs: 350,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000
  });

  currentSock = sock;

  // Remember every relayed message (interactive/button messages go through
  // relayMessage and would otherwise never be re-sendable on retry).
  const _origRelay = sock.relayMessage.bind(sock);
  sock.relayMessage = async (jid, message, opts = {}) => {
    const id = await _origRelay(jid, message, opts);
    try { rememberById(opts?.messageId || id, message); } catch {}
    return id;
  };

  // Message kinds that must NOT carry the "forwarded from channel" contextInfo.
  const NO_CTX = ['react', 'delete', 'edit', 'forward', 'poll', 'pin', 'disappearingMessagesInChat', 'groupInvite', 'listReply', 'buttonReply'];
  const _origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    let payload = content;
    // options.channelCtx === false → send as-is (used when forwarding someone else's content)
    const wantsCtx = options?.channelCtx !== false;
    if (options && 'channelCtx' in options) { const { channelCtx, ...rest } = options; options = rest; }
    if (
      wantsCtx &&
      typeof payload === 'object' && payload !== null &&
      !NO_CTX.some(k => k in payload) &&
      jid !== 'status@broadcast' && !String(jid).endsWith('@newsletter')
    ) {
      // fresh object per message; keeps mentions etc. already in contextInfo
      payload = { ...payload, contextInfo: newsletterContext(payload.contextInfo) };
    }
    const sent = await _origSend(jid, payload, options);
    try { rememberMessage(sent); } catch {}
    try {
      if (sent?.key && jid && jid !== 'status@broadcast') {
        const text = typeof payload === 'string' ? payload : (payload?.text || payload?.caption || '');
        const mediaType = payload?.image ? 'image' : (payload?.video ? 'video' : (payload?.audio ? 'audio' : (payload?.sticker ? 'sticker' : (payload?.document ? 'document' : null))));
        const mediaPath = typeof payload?.image?.url === 'string' ? payload.image.url : (typeof payload?.video?.url === 'string' ? payload.video.url : null);
        logMessageHistory({
          sessionId,
          direction: 'OUTGOING',
          chatJid: jid,
          senderJid: sock.user?.id || 'bot',
          messageText: text,
          mediaType,
          mediaPath,
          timestamp: Date.now(),
          msgId: sent.key.id,
          sock
        });
      }
    } catch (e) {
      try { console.error('[sendMessage:log]', e?.message); } catch {}
    }
    return sent;
  };

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr && !sock.authState.creds.registered && !pairingRequested) {
      pairingRequested = true;
      const number = pairingNumber || CONFIG.owner || null;
      if (number) {
        setTimeout(() => requestPairingCode(sock, number), 800);
      } else {
        console.log(tag, red('no phone number available for pairing'));
      }
    }

    if (connection === 'connecting') {
      console.log(tag, grey('connecting…'));
    }

    if (connection === 'open') {
      isStarting = false;
      reconnectAttempts = 0;
      console.log(tag, green(`online as +${sock.user?.id?.split(':')[0]}`));

      if (pairingNumber && !notifiedLinked) {
        notifiedLinked = true;
        notifyLinked();
      }

      try { reportOwnerBinding(sock); }     catch (e) { try { console.error('[ignite:owner]', e?.message); } catch {} }
      try { startScheduler(sock); }         catch (e) { try { console.error('[ignite:scheduler]', e?.message); } catch {} }
      try { startPresenceHeartbeat(sock); } catch (e) { try { console.error('[ignite:presence]', e?.message); } catch {} }
      try { startPpsSync(sock); }           catch (e) { try { console.error('[ignite:pps]', e?.message); } catch {} }
      try { handleStartupTasks(sock); }     catch (e) { try { console.error('[ignite:startup]', e?.message); } catch {} }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : 0;

      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log(tag, red('logged out · wiping session'));
        teardownSock();
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { try { console.error('[logout:rmSync]', e?.message); } catch {} }
        try { fs.mkdirSync(AUTH_DIR, { recursive: true }); }          catch (e) { try { console.error('[logout:mkdirSync]', e?.message); } catch {} }
        pairingRequested = false;
        notifiedLinked   = false;
        isStarting = false;
        reconnectAttempts = 0;
        setTimeout(ignite, 1500);
        return;
      }

      reconnectAttempts++;
      const base   = CONFIG.reconnectDelay || 2000;
      const waitMs = Math.min(base * Math.pow(2, reconnectAttempts - 1), 60000);
      console.log(tag, yellow(`reconnecting (${statusCode}) in ${waitMs / 1000}s · attempt ${reconnectAttempts}`));
      teardownSock();
      await delay(waitMs);
      isStarting = false;
      ignite();
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('groups.upsert', (groups) => {
    for (const g of groups || []) if (g?.id) groupCache.set(g.id, g);
  });
  sock.ev.on('groups.update', async (updates) => {
    for (const u of updates || []) {
      if (!u?.id) continue;
      try {
        groupCache.del(u.id);
        groupCache.set(u.id, await sock.groupMetadata(u.id));
      } catch {
        groupCache.del(u.id);
      }
    }
  });
  const _origGroupMeta = sock.groupMetadata.bind(sock);
  sock.groupMetadata = async (jid) => {
    const cached = groupCache.get(jid);
    if (cached) return cached;
    const meta = await _origGroupMeta(jid);
    if (meta?.id) groupCache.set(jid, meta);
    return meta;
  };

  sock.ev.on('messages.upsert', async (u) => {
    trace('messages.upsert', { session: sessionId, type: u.type, count: u.messages?.length });
    for (const m of u.messages || []) rememberMessage(m);
    for (const m of u.messages || []) {
      if (m?.message?.pollUpdateMessage) handlePollMessage(sock, m).catch((e) => console.error('[poll:upsert]', e.message));
    }
    try {
      if ((u.messages || []).some(m => m?.key?.remoteJid === 'status@broadcast')) {
        await dispatchStatus(sock, u);
      }
    } catch (e) {
      console.error('[dispatchStatus:upsert]', e);
    }
    await dispatch(sock, u, sessionId);
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
    await dispatch(s, { type: 'notify', messages: [fake] }, sessionId);
  });
  sock.ev.on('messages.update', (upd) => {
    handlePollUpdates(sock, upd).catch((e) => console.error('[poll:update]', e.message));
    dispatchUpdate(sock, upd);
  });

  sock.ev.on('messages.delete', async (deletion) => {
    try {
      if ('keys' in deletion) {
        for (const key of deletion.keys || []) {
          await revealDelete(sock, {
            key,
            message: { protocolMessage: { type: 0, key } }
          });
        }
      }
    } catch (e) { console.error('[messages.delete]', e.message); }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try { groupCache.del(update.id); } catch {}
    const mod = await import('./core/groupEvents.js').catch(() => null);
    if (mod?.handleGroupParticipantUpdate) mod.handleGroupParticipantUpdate(sock, update);
  });

  sock.ev.on('status.update', async (st) => {
    try { await dispatchStatus(sock, st); } catch (e) {
      console.error('[dispatchStatus:status.update]', e);
    }
  });

  sock.ev.on('chats.update', (updates) => {
    for (const update of updates) {
      if (update.chatTheme?.colorSchemeId) {
        console.log('[theme-discovery] Valid theme ID:', update.chatTheme.colorSchemeId);
      }
    }
  });

  sock.ev.on('messaging-history.set', (data) => {
    if (data.chats) {
      for (const chat of data.chats) {
        if (chat.chatTheme?.colorSchemeId) {
          console.log('[theme-discovery] History theme ID:', chat.chatTheme.colorSchemeId);
        }
      }
    }
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

function quiet(sig) {
  console.log(tag, grey(`${sig} — shutting down`));
  flushStore();
  teardownSock();
  setTimeout(() => process.exit(0), 400);
}
process.on('SIGINT',  () => quiet('SIGINT'));
process.on('SIGTERM', () => quiet('SIGTERM'));

ignite().catch(err => {
  console.error(tag, red('fatal:'), err);
  process.exit(1);
});
