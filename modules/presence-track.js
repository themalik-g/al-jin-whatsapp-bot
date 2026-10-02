// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/presence-track.js  (v2)
// Stalk: logs EVERY online/offline change of the contacts you track,
// keeps session durations and builds reports for any time window.
//
// What v2 fixes
//  • tracking is re-subscribed on every (re)connect and every 10 min
//    (v1 subscribed only once, so it silently died after a restart)
//  • "typing / recording / paused" no longer end an online session
//    (only "unavailable" means offline)
//  • only contacts you track are stored (v1 stored everybody)
//  • LID / phone-number JIDs are matched together
//  • in-memory store with debounced writes (v1 re-read and re-wrote
//    the whole JSON file on every presence event)
//  • gaps while the bot itself was offline are marked, not counted
// ─────────────────────────────────────────────
import { isOwner, ownerJid } from '../core/identity.js';
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { inState } from '../core/paths.js';
import { CONFIG } from '../config.js';
import { chunkText } from '../lib/net.js';
import {
    getBestUserJidSync, stripDevice, digitsOf,
    resolvePnToLid, resolveLidToPn
} from '../core/jid-resolver.js';

const DEBUG = process.env.MEHTAB_MD_DEBUG === '1';
const STORE_FILE = () => inState('stalk.json');

const MAX_EVENTS = 2000;            // events kept per contact (tiny arrays)
const FLUSH_MS = 15_000;            // debounce for disk writes
const ALIVE_MS = 120_000;           // "bot is alive" marker interval
const RESUB_MS = 10 * 60_000;       // re-subscribe interval
const NOTIFY_MIN_GAP_MS = 5_000;    // anti-spam for live alerts

// <pure>
const ON = 1, OFF = 0, GAP = 2;
const MAX_WINDOW_MS = 30 * 86_400_000;

function dur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

// events: [[timestamp, ON|OFF|GAP], ...]  →  [{ start, end|null, gap }]
function buildSessions(events) {
    const out = [];
    let start = null;
    for (const [t, code] of events) {
        if (code === ON) { if (start === null) start = t; }
        else if (start !== null) { out.push({ start, end: t, gap: code === GAP }); start = null; }
    }
    if (start !== null) out.push({ start, end: null, gap: false });
    return out;
}

// keep only the part of each session that falls inside [from, to]
function clipSessions(sessions, from, to) {
    const out = [];
    for (const s of sessions) {
        const s0 = Math.max(s.start, from);
        const s1 = Math.min(s.end ?? to, to);
        if (s1 > s0) out.push({ start: s0, end: s1, open: s.end === null, gap: s.gap });
    }
    return out;
}

function parseWindow(text) {
    const m = /^(\d+)\s*([mhd])$/i.exec(String(text || '').trim());
    if (!m) return null;
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
    return Math.min(Number(m[1]) * unit, MAX_WINDOW_MS);
}
// </pure>

// ── state ───────────────────────────────────────────────────────────────────
let store = null;                       // { version, alive, settings, contacts }
let dirty = false;
let flushTimer = null;
const aliases = new Map();              // jid (pn or lid) -> contact key
const triedLids = new Set();
const lastNotify = new Map();
const dbg = { received: 0, matched: 0, unmatched: 0, lastEventAt: 0, lastUnmatched: '', subOk: 0, subFail: 0, lastError: '' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tz = () => CONFIG.timezone || 'Asia/Karachi';
const fmt = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: tz() });
const fmtT = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz() });

function load() {
    if (store) return store;
    const raw = readJson(STORE_FILE(), null);
    const ok = raw && raw.version === 2 && raw.contacts;
    store = {
        version: 2,
        alive: ok ? raw.alive || 0 : 0,
        settings: { notify: false, ...(ok ? raw.settings : {}) },
        contacts: ok ? raw.contacts : {}
    };
    aliases.clear();
    for (const [key, rec] of Object.entries(store.contacts)) {
        if (rec.jid) aliases.set(stripDevice(rec.jid), key);
        if (rec.lid) aliases.set(stripDevice(rec.lid), key);
    }
    return store;
}

function markDirty() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(flushNow, FLUSH_MS);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function flushNow() {
    flushTimer = null;
    if (!dirty || !store) return;
    try { writeJsonAtomic(STORE_FILE(), store); dirty = false; } catch (e) {
        if (DEBUG) console.log('[stalk] save failed:', e.message);
    }
}
process.on('SIGINT', flushNow);
process.on('SIGTERM', flushNow);

// ── contact helpers ─────────────────────────────────────────────────────────
function makeKey(jid) {
    return digitsOf(getBestUserJidSync(jid)) || digitsOf(jid);
}

function addAlias(key, jid) {
    if (jid) aliases.set(stripDevice(jid), key);
}

function findKey(jid) {
    if (!jid) return null;
    const clean = stripDevice(jid);
    if (aliases.has(clean)) return aliases.get(clean);
    const best = getBestUserJidSync(clean);
    return aliases.get(best) || null;
}

function findByInput(input) {
    const digits = String(input || '').replace(/\D/g, '');
    if (digits.length < 5) return null;
    for (const [key, rec] of Object.entries(store.contacts)) {
        if (key === digits || key.endsWith(digits)) return { key, rec };
        if (digitsOf(rec.jid).endsWith(digits)) return { key, rec };
        if (rec.lid && digitsOf(rec.lid) === digits) return { key, rec };
    }
    return null;
}

function addContact(jid, lid) {
    const key = makeKey(jid);
    let rec = store.contacts[key];
    if (!rec) {
        rec = store.contacts[key] = {
            jid: stripDevice(jid),
            lid: lid ? stripDevice(lid) : null,
            tracked: true,
            since: Date.now(),
            events: []
        };
    } else {
        rec.tracked = true;
        if (lid && !rec.lid) rec.lid = stripDevice(lid);
    }
    addAlias(key, rec.jid);
    addAlias(key, rec.lid);
    markDirty();
    return { key, rec };
}

function label(rec) {
    const d = digitsOf(rec.jid);
    return rec.jid.endsWith('@lid') ? `LID ${d}` : `+${d}`;
}

function isSelfJid(sock, jid) {
    const d = digitsOf(jid);
    if (!d) return false;
    return d === digitsOf(sock?.user?.id) || d === digitsOf(sock?.user?.lid);
}

function stateText(rec, now = Date.now()) {
    const last = rec.events[rec.events.length - 1];
    if (!last) return '⏳ no presence received yet';
    if (last[1] === ON) return `🟢 online since ${fmt(last[0])} (${dur(now - last[0])})`;
    if (last[1] === OFF) return `⚪ offline since ${fmt(last[0])}`;
    return `⚠️ unknown (bot was offline from ${fmt(last[0])})`;
}

// ── recording ───────────────────────────────────────────────────────────────
async function notifyOwner(sock, key, rec, online, sessionMs) {
    try {
        if (!store.settings.notify) return;
        const now = Date.now();
        if (now - (lastNotify.get(key) || 0) < NOTIFY_MIN_GAP_MS) return;
        lastNotify.set(key, now);
        const to = ownerJid();
        if (!to || to.startsWith('@')) return;
        const text = online
            ? `🟢 ${label(rec)} came online · ${fmtT(now)}`
            : `⚪ ${label(rec)} went offline · ${fmtT(now)}${sessionMs ? `\n   was online ${dur(sessionMs)}` : ''}`;
        await sock.sendMessage(to, { text });
    } catch (e) {
        if (DEBUG) console.log('[stalk] notify failed:', e.message);
    }
}

function record(sock, key, status, now) {
    const rec = store.contacts[key];
    if (!rec || !rec.tracked) return;

    // WhatsApp only says "unavailable" when the person is offline.
    // available / composing / recording / paused all mean "online".
    const online = status !== 'unavailable';
    const last = rec.events[rec.events.length - 1];
    const wasOnline = !!last && last[1] === ON;

    if (last && wasOnline === online && last[1] !== GAP) return; // no change

    const sessionMs = wasOnline && !online ? now - last[0] : 0;
    rec.events.push([now, online ? ON : OFF]);
    if (rec.events.length > MAX_EVENTS) rec.events.splice(0, rec.events.length - MAX_EVENTS);
    dbg.lastEventAt = now;
    markDirty();

    if (online || last) notifyOwner(sock, key, rec, online, sessionMs);
}

async function learnAlias(sock, jid) {
    const clean = stripDevice(jid);
    if (!clean.endsWith('@lid') || triedLids.has(clean)) return null;
    triedLids.add(clean);
    if (triedLids.size > 300) triedLids.delete(triedLids.values().next().value);
    try {
        const res = await resolveLidToPn(sock, clean);
        if (res?.pn) {
            const key = findKey(res.pn);
            if (key) {
                addAlias(key, clean);
                if (!store.contacts[key].lid) store.contacts[key].lid = clean;
                markDirty();
                return key;
            }
        }
    } catch { /* ignore */ }
    return null;
}

async function handlePresence(sock, update) {
    const { id, presences } = update || {};
    if (!presences || !store) return;
    dbg.received++;
    const now = Date.now();
    for (const [rawJid, p] of Object.entries(presences)) {
        const status = p?.lastKnownPresence;
        if (!status) continue;
        let key = findKey(rawJid);
        if (!key && id && !String(id).endsWith('@g.us')) key = findKey(id);
        if (!key) key = await learnAlias(sock, rawJid);
        if (!key) { dbg.unmatched++; dbg.lastUnmatched = stripDevice(rawJid); continue; }
        dbg.matched++;
        record(sock, key, status, now);
    }
}

// ── subscriptions ───────────────────────────────────────────────────────────
async function subscribeOne(sock, rec) {
    for (const jid of [rec.jid, rec.lid].filter(Boolean)) {
        try { await sock.presenceSubscribe(jid); dbg.subOk++; return true; }
        catch (e) { dbg.subFail++; dbg.lastError = e?.message || String(e); }
    }
    return false;
}

async function subscribeAll(sock) {
    if (!store) return;
    for (const rec of Object.values(store.contacts)) {
        if (!rec.tracked) continue;
        await subscribeOne(sock, rec);
        await sleep(500);
    }
}

// When the bot was offline we cannot know what happened: close open sessions
// at the last moment the bot was known to be alive.
function markGap(now) {
    const t = Math.min(now, store.alive || now);
    for (const rec of Object.values(store.contacts)) {
        const last = rec.events[rec.events.length - 1];
        if (last && last[1] === ON) {
            rec.events.push([Math.max(t, last[0]), GAP]);
            markDirty();
        }
    }
}

const attached = new WeakSet();

export function startStalk(sock) {
    if (!sock?.ev || attached.has(sock)) return;
    attached.add(sock);
    try {
        load();
        markGap(Date.now());
        store.alive = Date.now();
        markDirty();

        sock.ev.on('presence.update', (u) => {
            handlePresence(sock, u).catch((e) => { if (DEBUG) console.log('[stalk]', e.message); });
        });

        const first = setTimeout(() => subscribeAll(sock).catch(() => {}), 4000);
        const resub = setInterval(() => subscribeAll(sock).catch(() => {}), RESUB_MS);
        const alive = setInterval(() => { store.alive = Date.now(); markDirty(); }, ALIVE_MS);
        for (const t of [first, resub, alive]) t.unref?.();

        sock.ev.on('connection.update', ({ connection }) => {
            if (connection === 'close') {
                clearTimeout(first); clearInterval(resub); clearInterval(alive);
                if (store) { store.alive = Date.now(); flushNow(); }
            }
        });
    } catch (e) {
        console.error('[stalk] start failed:', e.message);
    }
}

// kept for router.js compatibility
export const attachPresenceTracker = startStalk;

// ── command helpers ─────────────────────────────────────────────────────────
function ownerOnly(sock, chat, msg) {
    const from = msg.key.participant || msg.key.remoteJid;
    if (!msg.key.fromMe && !isOwner(from)) {
        sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg }).catch(() => {});
        return true;
    }
    return false;
}

const HELP =
    '👁️ *stalk* — online/offline logger\n\n' +
    '`.stalk <number>` — start tracking (or reply to a message)\n' +
    '`.stalk list` — everyone tracked + current state\n' +
    '`.stalk log <number> [n]` — last n online/offline events\n' +
    '`.stalk report [number] [8h|2d|30m]` — online time in a window (all contacts if no number)\n' +
    '`.stalk notify on|off` — live alert in your chat on every change\n' +
    '`.stalk stop <number>` — pause tracking (keeps data)\n' +
    '`.stalk remove <number>` — delete tracking + data\n' +
    '`.stalk debug` — check that presence events are arriving';

function windowStats(rec, from, to) {
    const cover = Math.max(from, rec.since || from);
    const sessions = clipSessions(buildSessions(rec.events), cover, to);
    const total = sessions.reduce((a, s) => a + (s.end - s.start), 0);
    const longest = sessions.reduce((a, s) => Math.max(a, s.end - s.start), 0);
    return { cover, sessions, total, longest };
}

// ── sub-commands ────────────────────────────────────────────────────────────
async function cmdTrack(sock, chat, msg, args, say) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const digits = (args || []).join('').replace(/\D/g, '');
    let jid = null, lid = null;

    if (digits.length >= 7) {
        let wa = null;
        try { wa = (await sock.onWhatsApp(digits))?.[0]; } catch { /* fall back below */ }
        if (wa && wa.exists === false) return say(`❌ \`${digits}\` is not on WhatsApp.`);
        jid = wa?.jid || `${digits}@s.whatsapp.net`;
        lid = wa?.lid || null;
    } else if (ctx?.participant && !isSelfJid(sock, ctx.participant)) {
        jid = ctx.participant;
    } else if (!args?.length && !chat.endsWith('@g.us') && !isSelfJid(sock, chat)) {
        jid = chat; // used inside a private chat
    }
    if (!jid) return say(HELP);

    jid = getBestUserJidSync(jid);
    if (!lid && jid.endsWith('@s.whatsapp.net')) {
        try { lid = (await resolvePnToLid(sock, jid))?.lid || null; } catch { /* optional */ }
    }

    const { key, rec } = addContact(jid, lid);
    const ok = await subscribeOne(sock, rec);
    if (!ok) {
        return say(`❌ Could not subscribe to presence for \`${label(rec)}\`.\n_${dbg.lastError || 'unknown error'}_`);
    }

    await sleep(1500);
    const cur = store.contacts[key];
    const lines = [
        `👁️ *stalk* · \`${label(cur)}\``, '',
        'Tracking is ON. Every online/offline change is logged.',
        `• now · ${stateText(cur)}`
    ];
    if (!cur.events.length) {
        lines.push('', '_No presence yet. WhatsApp sends it only if the person shows Last Seen/Online to you — and if your own Last Seen is hidden, WhatsApp may hide theirs too. Run `.stalk debug` if nothing arrives._');
    }
    lines.push('', '`.stalk log <number>` · `.stalk report <number> 8h`');
    return say(lines.join('\n'));
}

async function cmdList(say) {
    const keys = Object.keys(store.contacts);
    if (!keys.length) return say('👁️ Nobody is tracked yet. Use `.stalk <number>`.');
    const now = Date.now();
    const lines = [`👁️ *tracked contacts* · ${keys.length}`, ''];
    for (const key of keys.slice(0, 30)) {
        const rec = store.contacts[key];
        const st = windowStats(rec, now - 86_400_000, now);
        lines.push(`• \`${label(rec)}\`${rec.tracked ? '' : ' · ⏸️ paused'}`);
        lines.push(`   ${stateText(rec, now)}`);
        lines.push(`   last 24h · ${st.sessions.length} sessions · ${dur(st.total)} online`);
    }
    lines.push('', `_Times in ${tz()}_`);
    return say(lines.join('\n'));
}

async function cmdStop(say, input, remove) {
    const hit = findByInput(input);
    if (!hit) return say('❌ Usage: `.stalk stop <number>` (must be a tracked contact).');
    if (remove) {
        delete store.contacts[hit.key];
        for (const [j, k] of aliases) if (k === hit.key) aliases.delete(j);
    } else {
        hit.rec.tracked = false;
    }
    markDirty();
    return say(remove ? `🗑️ Removed \`${label(hit.rec)}\` and its data.` : `⏸️ Stopped tracking \`${label(hit.rec)}\` (data kept).`);
}

async function cmdLog(say, rest) {
    let n = 20, input = '';
    for (const a of rest) { if (/^\d{1,3}$/.test(a)) n = Math.min(Number(a), 60); else input += a; }
    const hit = findByInput(input);
    if (!hit) return say('❌ Usage: `.stalk log <number> [count]`');

    const ev = hit.rec.events;
    if (!ev.length) return say(`👁️ No events logged yet for \`${label(hit.rec)}\`.`);
    const lines = [`📜 *log* · \`${label(hit.rec)}\` · last ${Math.min(n, ev.length)} events`, ''];
    const start = Math.max(0, ev.length - n);
    for (let i = start; i < ev.length; i++) {
        const [t, code] = ev[i];
        const prev = i > 0 ? ev[i - 1] : null;
        if (code === ON) lines.push(`🟢 online · ${fmt(t)}`);
        else if (code === OFF) lines.push(`⚪ offline · ${fmt(t)}${prev && prev[1] === ON ? ` · was online ${dur(t - prev[0])}` : ''}`);
        else lines.push(`⚠️ bot offline · ${fmt(t)}${prev && prev[1] === ON ? ` · online for at least ${dur(t - prev[0])}` : ''}`);
    }
    lines.push('', `_Times in ${tz()}_`);
    return say(lines.join('\n'));
}

async function cmdReport(say, rest) {
    let windowMs = 86_400_000, input = '';
    for (const a of rest) { const w = parseWindow(a); if (w) windowMs = w; else input += a; }
    const now = Date.now();
    const from = now - windowMs;
    const wLabel = dur(windowMs);

    if (!input) {
        const keys = Object.keys(store.contacts);
        if (!keys.length) return say('👁️ Nobody is tracked yet.');
        const lines = [`📈 *stalk report* · last ${wLabel}`, ''];
        for (const key of keys.slice(0, 30)) {
            const rec = store.contacts[key];
            const st = windowStats(rec, from, now);
            const lastOn = st.sessions[st.sessions.length - 1];
            lines.push(`• \`${label(rec)}\` · ${dur(st.total)} online · ${st.sessions.length} sessions`);
            if (lastOn) lines.push(`   last online ${lastOn.open ? '· *right now*' : `· ${fmt(lastOn.end)}`}`);
        }
        lines.push('', '_Use `.stalk report <number> 8h` for the session list._');
        return say(lines.join('\n'));
    }

    const hit = findByInput(input);
    if (!hit) return say('❌ That number is not tracked. Use `.stalk <number>` first.');
    const st = windowStats(hit.rec, from, now);
    const span = now - st.cover;
    const pct = span > 0 ? Math.round((st.total / span) * 100) : 0;
    const f = windowMs > 20 * 3_600_000 ? fmt : fmtT;

    const lines = [`📈 *report* · \`${label(hit.rec)}\` · last ${wLabel}`, ''];
    if (st.cover > from) lines.push(`_tracked only since ${fmt(st.cover)}_`);
    lines.push(
        `• online time · *${dur(st.total)}* (${pct}% of tracked time)`,
        `• sessions · ${st.sessions.length}` + (st.sessions.length ? ` · longest ${dur(st.longest)} · avg ${dur(st.total / st.sessions.length)}` : ''),
        `• now · ${stateText(hit.rec, now)}`
    );
    if (st.sessions.length) {
        lines.push('', `*sessions* (newest last) · _${tz()}_`);
        const shown = st.sessions.slice(-25);
        if (st.sessions.length > shown.length) lines.push(`_… ${st.sessions.length - shown.length} older sessions not shown_`);
        for (const s of shown) {
            lines.push(`🟢 ${f(s.start)} → ${s.open ? '*still online*' : `⚪ ${f(s.end)}`} · ${dur(s.end - s.start)}${s.gap ? ' ⚠️' : ''}`);
        }
        if (shown.some((s) => s.gap)) lines.push('', '⚠️ = bot was offline afterwards, real time online may be longer');
    }
    return say(lines.join('\n'));
}

async function cmdNotify(say, value) {
    const v = String(value || '').toLowerCase();
    if (v !== 'on' && v !== 'off') {
        return say(`🔔 Live alerts are *${store.settings.notify ? 'ON' : 'OFF'}*. Use \`.stalk notify on|off\`.`);
    }
    store.settings.notify = v === 'on';
    markDirty();
    return say(store.settings.notify ? '🔔 Live alerts ON — you get a message every time a tracked contact goes online/offline.' : '🔕 Live alerts OFF.');
}

async function cmdDebug(say) {
    const now = Date.now();
    const all = Object.values(store.contacts);
    const presenceCfg = readJson(inState('presence.json'), {});
    const lines = [
        '🧪 *stalk debug*', '',
        `• tracked · ${all.filter((r) => r.tracked).length} active / ${all.length} total`,
        `• presence events received · ${dbg.received} (matched ${dbg.matched} · unmatched ${dbg.unmatched})`,
        `• last logged change · ${dbg.lastEventAt ? `${dur(now - dbg.lastEventAt)} ago` : 'none since start'}`,
        `• subscribe ok/failed · ${dbg.subOk}/${dbg.subFail}${dbg.lastError ? `\n   last error: ${dbg.lastError}` : ''}`,
        `• live alerts · ${store.settings.notify ? 'ON' : 'OFF'}`,
        `• bot Always Online · ${presenceCfg.alwaysOnline ? 'ON' : 'OFF'}`
    ];
    if (dbg.lastUnmatched) lines.push(`• last unmatched JID · ${dbg.lastUnmatched}`);
    lines.push('', '_0 events? Possible causes: the contact hides Last Seen/Online, your own Last Seen is hidden, or the bot is not "online" (try `.presence online on`, which also shows your account as online)._');
    return say(lines.join('\n'));
}

// ── .stalk ──────────────────────────────────────────────────────────────────
export async function stalkCommand(sock, chat, msg, args) {
    if (ownerOnly(sock, chat, msg)) return;
    const say = async (text) => {
        for (const part of chunkText(text, 3800)) await sock.sendMessage(chat, { text: part }, { quoted: msg });
    };
    try {
        load();
        const a0 = (args?.[0] || '').toLowerCase();
        const rest = (args || []).slice(1);
        switch (a0) {
            case 'list': return await cmdList(say);
            case 'stop': return await cmdStop(say, rest.join(' '), false);
            case 'remove': return await cmdStop(say, rest.join(' '), true);
            case 'log': return await cmdLog(say, rest);
            case 'report': return await cmdReport(say, rest);
            case 'notify': return await cmdNotify(say, rest[0]);
            case 'debug': return await cmdDebug(say);
            case 'help': return await say(HELP);
            default: return await cmdTrack(sock, chat, msg, args, say);
        }
    } catch (e) {
        await sock.sendMessage(chat, { text: `⚠️ stalk failed: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}
