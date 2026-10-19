// ─────────────────────────────────────────────
//  Al-Jin · modules/katabump.js
//  .kb  (alias .kbstart)  <api>,<server id>,<number | Session ID>   — open to everyone
//
//  Deploys the Al-Jin LITE bot onto a KataBump (Pterodactyl) server:
//    1. connect to the panel with the client API key
//    2. stop the server, wipe every file in its root
//    3. fetch index.js from themalik-g/al-jin-lite and set Pairing_Number
//       (or, when a Session ID JIN_… is given instead of a number, set SESSION_ID — no pairing code)
//    4. upload it to the server root and start the server
//    5. watch the live console (fetching files → install → node start)
//    6. grab the pairing code and send it to this chat
//    7. wait for the WhatsApp link → "bot is live"
//  Every step is shown by editing ONE status message.
// ─────────────────────────────────────────────
import WebSocket from 'ws';
import { findSessionId, sessionApiBase, maskSessionId, downloadSessionCreds } from '../lib/session-id.js';

const LITE_RAW = [
  'https://raw.githubusercontent.com/themalik-g/al-jin-lite/main/index.js',
  'https://cdn.jsdelivr.net/gh/themalik-g/al-jin-lite@main/index.js',
];
const PANEL_HOSTS = (process.env.KATABUMP_URL
  ? [process.env.KATABUMP_URL]
  : ['https://control.katabump.com', 'https://dashboard.katabump.com', 'https://panel.katabump.com']
).map((u) => u.replace(/\/+$/, ''));

const PAIR_WAIT_MS = 6 * 60_000;   // fetch + npm install can be slow
const LINK_WAIT_MS = 5 * 60_000;   // time the user has to enter the code

let busy = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

// .kb / .kbstart is open to everyone: anyone can deploy their own bot on KataBump.

// ── tiny Pterodactyl client ─────────────────
class Panel {
  constructor(base, key, id) { this.base = base; this.key = key; this.id = id; }
  async call(method, path, { body, raw, query } = {}) {
    const url = `${this.base}/api/client/servers/${this.id}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        Accept: 'application/vnd.pterodactyl.v1+json',
        ...(body ? { 'Content-Type': 'application/json' } : raw != null ? { 'Content-Type': 'text/plain' } : {}),
      },
      body: body ? JSON.stringify(body) : raw != null ? raw : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      let detail = t.slice(0, 160);
      try { detail = JSON.parse(t)?.errors?.[0]?.detail || detail; } catch {}
      const e = new Error(`${res.status} ${detail}`.trim());
      e.status = res.status;
      throw e;
    }
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return txt; }
  }
  info()            { return this.call('GET', ''); }
  state()           { return this.call('GET', '/resources').then((r) => r?.attributes?.current_state); }
  power(signal)     { return this.call('POST', '/power', { body: { signal } }); }
  list(dir = '/')   { return this.call('GET', '/files/list', { query: { directory: dir } }); }
  remove(files)     { return this.call('POST', '/files/delete', { body: { root: '/', files } }); }
  write(file, text) { return this.call('POST', '/files/write', { raw: text, query: { file } }); }
  ws()              { return this.call('GET', '/websocket'); }
}

async function connectPanel(key, id) {
  let lastErr;
  for (const base of PANEL_HOSTS) {
    const p = new Panel(base, key, id);
    try { const info = await p.info(); return { panel: p, name: info?.attributes?.name || id }; }
    catch (e) {
      lastErr = e;
      if (e.status === 401 || e.status === 403) throw new Error('API key rejected by the panel (401/403)');
      if (e.status === 404 && base === PANEL_HOSTS[PANEL_HOSTS.length - 1]) throw new Error('server id not found (404)');
    }
  }
  throw new Error(`panel unreachable${lastErr ? ' — ' + lastErr.message : ''}`);
}

async function fetchLiteIndex() {
  let err;
  for (const u of LITE_RAW) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
      if (r.ok) { const t = await r.text(); if (t.length > 1000) return t; }
    } catch (e) { err = e; }
  }
  throw new Error(`could not download index.js${err ? ' — ' + err.message : ''}`);
}

function setNumber(src, number) {
  const re = /const\s+Pairing_Number\s*=\s*(['"`])[^'"`]*\1\s*;|const\s+Pairing_Number\s*=\s*\d+\s*;/;
  if (!re.test(src)) throw new Error('Pairing_Number line not found in index.js');
  return src.replace(re, () => `const Pairing_Number = '${number}';`);
}

// ── live console watcher ────────────────────
// Calls onLine(cleanLine) for every console line. Resolves nothing; use close().
function watchConsole(panel, onLine, onStatus) {
  let sock, closed = false, buf = '';
  const open = async () => {
    if (closed) return;
    try {
      const { data } = await panel.ws();
      sock = new WebSocket(data.socket, { origin: panel.base });
      sock.on('open', () => sock.send(JSON.stringify({ event: 'auth', args: [data.token] })));
      sock.on('message', async (raw) => {
        let m; try { m = JSON.parse(raw.toString()); } catch { return; }
        if (m.event === 'auth success') sock.send(JSON.stringify({ event: 'send logs', args: [null] }));
        else if (m.event === 'console output') {
          buf += String(m.args?.[0] ?? '') + '\n';
          for (const l of buf.split('\n')) { const c = l.replace(ANSI, '').trim(); if (c) onLine(c); }
          buf = '';
        } else if (m.event === 'status') onStatus?.(m.args?.[0]);
        else if (m.event === 'token expiring' || m.event === 'token expired') {
          try { const t = (await panel.ws()).data.token; sock.send(JSON.stringify({ event: 'auth', args: [t] })); } catch {}
        }
      });
      sock.on('close', () => { if (!closed) setTimeout(open, 3000); });
      sock.on('error', () => {});
    } catch { if (!closed) setTimeout(open, 5000); }
  };
  open();
  return () => { closed = true; try { sock?.close(); } catch {} };
}

// ── Session ID helpers ──────────────────────
// Does the downloaded index.js already know where the session store is?
function apiInFile(src) {
  const m = src.match(/const\s+SESSION_API\s*=\s*(['"`])\s*(https?:\/\/[^'"`\s]+)\s*\1/i);
  return m ? m[2].replace(/\/+$/, '') : '';
}

// Puts the Session ID into index.js (and the store address, if the file has none) so the bot logs in
// straight from the saved session — no pairing code. Pairing_Number is cleared so pairing can never start.
function setSessionId(src, id, api) {
  const reId = /const\s+SESSION_ID\s*=\s*(['"`])[^'"`]*\1\s*;/;
  if (!reId.test(src)) throw new Error('SESSION_ID line not found in index.js (the al-jin-lite repo needs the Session ID update)');
  let out = src.replace(reId, () => `const SESSION_ID = '${id}';`);
  out = out.replace(/const\s+Pairing_Number\s*=\s*(['"`])[^'"`]*\1\s*;/, () => "const Pairing_Number = '';");
  const reApi = /const\s+SESSION_API\s*=\s*(['"`])([^'"`]*)\1\s*;/;
  const m = out.match(reApi);
  if (m && !/^https?:\/\//i.test(m[2]) && api) out = out.replace(reApi, () => `const SESSION_API = '${api}';`);
  return out;
}

// ── command ─────────────────────────────────
export async function kbstartCommand(sock, chat, msg, args) {
  const usage = '⚙️ *Usage*\n`.kb <api>,<server id>,<number>`\n`.kb <api>,<server id>,<Session ID>`\n\nExamples:\n`.kb ptlc_xxxxx,a1b2c3d4,923001234567`\n`.kb ptlc_xxxxx,a1b2c3d4,JIN_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`\n\n_Number → you get a pairing code to enter in WhatsApp._\n_Session ID → the bot logs in directly, no code needed._\n_Tip: send it in a private chat — your API key and Session ID are secrets._';
  const parts = args.join(' ').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 3) { await sock.sendMessage(chat, { text: usage }, { quoted: msg }); return; }
  const [apiKey, serverId, rawThird] = parts;
  const sessionId = findSessionId(rawThird);          // JIN_… instead of a number → deploy with the Session ID
  const number = sessionId ? '' : rawThird.replace(/\D/g, '');
  if (!sessionId && /^JIN_/i.test(rawThird)) {
    await sock.sendMessage(chat, { text: '❌ That Session ID looks incomplete — copy the whole `JIN_…` value.' }, { quoted: msg });
    return;
  }
  if (!sessionId && !/^\d{10,15}$/.test(number)) {
    await sock.sendMessage(chat, { text: '❌ The last value must be a number (10–15 digits with country code, no +) or a Session ID (`JIN_…`).' }, { quoted: msg });
    return;
  }
  if (busy) { await sock.sendMessage(chat, { text: '⏳ A KataBump deployment is already running.' }, { quoted: msg }); return; }
  busy = true;

  // The message contains the API key (and maybe a Session ID) → remove it from the chat right away.
  try { await sock.sendMessage(chat, { delete: msg.key }); } catch {}

  const who = sessionId ? `Session ${maskSessionId(sessionId)}` : `+${number}`;
  const STEPS = sessionId ? [
    'Connecting to KataBump',
    'Stopping server & clearing old files',
    'Fetching index.js from al-jin-lite',
    'Uploading index.js (Session ID set)',
    'Starting server',
    'Fetching bot files & installing',
    'Logging in with Session ID',
    'WhatsApp connected',
  ] : [
    'Connecting to KataBump',
    'Stopping server & clearing old files',
    'Fetching index.js from al-jin-lite',
    'Uploading index.js (number set)',
    'Starting server',
    'Fetching bot files & installing',
    'Node started — requesting pairing code',
    'Pairing code sent',
    'WhatsApp linked',
  ];
  const LAST = STEPS.length - 1;
  const done = new Set();
  let current = -1, note = '';
  let sent = null;
  const render = (head) => {
    const lines = STEPS.map((s, i) => `${done.has(i) ? '✅' : i === current ? '⏳' : '▫️'} ${s}`);
    return `🚀 *KataBump · Al-Jin Lite*\n${who}\n\n${lines.join('\n')}${note ? `\n\n${note}` : ''}${head ? `\n\n${head}` : ''}`;
  };
  const push = async (head) => {
    const text = render(head);
    try {
      if (!sent) sent = await sock.sendMessage(chat, { text });
      else await sock.sendMessage(chat, { text, edit: sent.key });
    } catch {}
  };
  const step = async (i, n = '') => { if (current >= 0) done.add(current); current = i; note = n; await push(); };

  let stopWatch = null;
  try {
    await step(0);
    const { panel, name } = await connectPanel(apiKey, serverId);
    note = `Server: ${name}`;

    // Session ID mode: check everything BEFORE the server is touched, so a typo never wipes a server for nothing.
    let prefetched = null;
    if (sessionId) {
      await step(0, `Server: ${name} · checking Session ID…`);
      prefetched = await fetchLiteIndex();
      const store = apiInFile(prefetched) || sessionApiBase();
      const chk = await downloadSessionCreds(sessionId, store);
      if (chk.error) throw new Error(`Session ID check failed — ${chk.error}. (Your server was not touched.)`);
      note = `Server: ${name} · Session ID verified`;
    }

    // 2 — stop + wipe
    await step(1, note);
    try { await panel.power('kill'); } catch {}
    for (let i = 0; i < 20; i++) { if ((await panel.state().catch(() => 'offline')) === 'offline') break; await sleep(1500); }
    const files = (await panel.list('/'))?.data?.map((f) => f.attributes.name) || [];
    for (let i = 0; i < files.length; i += 50) await panel.remove(files.slice(i, i + 50));
    note = `Server: ${name} · removed ${files.length} item(s)`;

    // 3 — fetch
    await step(2, note);
    const base = prefetched || (await fetchLiteIndex());
    const src = sessionId ? setSessionId(base, sessionId, sessionApiBase()) : setNumber(base, number);

    // 4 — upload
    await step(3, note);
    await panel.write('/index.js', src);

    // 5 — watch console, then start
    let code = null, linked = false, stage = 0, failLine = '';
    let onCode = null, onLinked = null;
    const codeP = new Promise((r) => (onCode = r));
    const linkP = new Promise((r) => (onLinked = r));
    let lastTxt = '';
    stopWatch = watchConsole(panel, (l) => {
      lastTxt = l;
      if (/fetching al-jin|cloning|installing dependencies|npm (install|i)\b/i.test(l)) stage = Math.max(stage, 1);
      if (/dependencies locked in|starting session|spawning session/i.test(l)) stage = Math.max(stage, 2);
      if (sessionId) {
        // Session ID mode: no pairing code — watch for a login failure, or for "online as +…".
        if (!failLine && /session ID:\s*(Session ID not found|could not reach|SESSION_API is missing|SESSION_ID is not valid|the stored login is not valid|session store answered)/i.test(l)) failLine = l;
        if (/online as \+/i.test(l) && !linked) { linked = true; onLinked(); }
        return;
      }
      const m = l.match(/\bcode\s+([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
      if (m && !code) { code = m[1]; onCode(code); }
      if (code && /online as \+|✔.*linked|connected ✅/i.test(l)) { if (!linked) { linked = true; onLinked(); } }
    });
    await sleep(1500);
    await step(4, note);
    await panel.power('start');

    await step(5, note);

    if (sessionId) {
      // ── Session ID: wait until the bot is online ──
      const t0 = Date.now();
      const MAX = PAIR_WAIT_MS + LINK_WAIT_MS;
      let shown = 5;
      while (!linked) {
        if (failLine) throw new Error(failLine.replace(/^.*?session ID:\s*/i, '').slice(0, 160));
        if (Date.now() - t0 > MAX) throw new Error(`bot did not come online within ${MAX / 60000} min. Last console line: ${lastTxt.slice(0, 120) || '—'}`);
        if (stage >= 2 && shown < 6) { shown = 6; await step(6, note); }
        await Promise.race([linkP, sleep(2000)]);
      }
      await step(LAST);
      done.add(LAST); current = -1;
      await push('🟢 *Bot is live*');
      await sock.sendMessage(chat, { text: `🟢 *Bot is live* on KataBump (${who}) — logged in with Session ID, no pairing code needed.` }, { quoted: msg });
      return;
    }

    // ── Number: pairing-code flow ──
    let shownStage = 0;
    const t0 = Date.now();
    while (!code) {
      if (Date.now() - t0 > PAIR_WAIT_MS) throw new Error(`no pairing code after ${PAIR_WAIT_MS / 60000} min. Last console line: ${lastTxt.slice(0, 120) || '—'}`);
      if (stage > shownStage && stage >= 2) { shownStage = stage; await step(6, note); }
      await Promise.race([codeP, sleep(2000)]);
    }
    if (current < 6) await step(6, note);

    // 7 — send code
    await step(7, note);
    await sock.sendMessage(chat, { text: code });
    await sock.sendMessage(chat, {
      text: `🔑 Pairing code for *+${number}* (above)\n\nWhatsApp → Linked Devices → Link a Device → *Link with phone number instead* and enter the code.\n\n⏳ Waiting for you to log in…`,
    });
    await push('🔑 Code sent — waiting for login');

    // 8 — wait for link
    await Promise.race([
      linkP,
      sleep(LINK_WAIT_MS).then(() => { throw new Error('login not completed within 5 min (code may have expired — run .kb again)'); }),
    ]);
    await step(8);
    done.add(8); current = -1;
    await push('🟢 *Bot is live*');
    await sock.sendMessage(chat, { text: `🟢 *Bot is live* on KataBump (+${number})` }, { quoted: msg });
  } catch (e) {
    note = '';
    await push(`❌ *Failed:* ${e.message}`);
  } finally {
    try { stopWatch?.(); } catch {}
    busy = false;
  }
}
