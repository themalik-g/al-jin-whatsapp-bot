// ─────────────────────────────────────────────
//  𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/activity.js  (v2)
//  In-memory cache + debounced atomic flush.
//
//  v2 fixes
//   • WhatsApp Status posts (status@broadcast) are no longer counted
//     as a "chat" — they used to top the dashboard
//   • a person with both a LID and a phone-number chat is counted once
//   • `.activity <number>` also finds chats stored under a LID
//   • per-chat sender list is capped, so big groups can't grow forever
// ─────────────────────────────────────────────
import { isOwner } from '../core/identity.js';
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { inState } from '../core/paths.js';
import { getBestUserJidSync, getCachedPnForLid } from '../core/jid-resolver.js';

const STATE = () => inState('activity.json');
const DEBUG = process.env.MEHTAB_MD_DEBUG === '1';
const FLUSH_MS = 5000;
const MAX_SENDERS_PER_CHAT = 150;   // prune when above this
const PRUNE_TO = 100;               // ...down to this many (most recent kept)

let _cache = null;
let _dirty = false;
let _flushTimer = null;

function read() {
    if (_cache) return _cache;
    _cache = readJson(STATE(), {});
    // clean up records created by older versions
    for (const jid of Object.keys(_cache)) {
        if (isIgnored(jid)) delete _cache[jid];
    }
    return _cache;
}

function write(o) {
    _cache = o;
    _dirty = true;
    scheduleFlush();
}

function scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(() => {
        _flushTimer = null;
        if (!_dirty) return;
        try { writeJsonAtomic(STATE(), _cache); _dirty = false; } catch {}
    }, FLUSH_MS);
    if (typeof _flushTimer.unref === 'function') _flushTimer.unref();
}

function flushNow() {
    if (!_dirty) return;
    try { writeJsonAtomic(STATE(), _cache); _dirty = false; } catch {}
}
process.on('SIGINT', flushNow);
process.on('SIGTERM', flushNow);

// status posts and broadcast lists are not chats
function isIgnored(jid) {
    return !jid || jid === 'status@broadcast' || jid.endsWith('@broadcast');
}

// use the phone-number JID when a LID is known, so one person = one record
function canonical(jid) {
    if (!jid) return jid;
    if (jid.endsWith('@lid') || jid.endsWith('@s.whatsapp.net')) return getBestUserJidSync(jid);
    return jid;
}

function newRec() {
    return { total: 0, texts: 0, media: 0, lastActive: 0, firstSeen: Date.now(), contacts: {} };
}

function mergeRec(into, from) {
    into.total += from.total || 0;
    into.texts += from.texts || 0;
    into.media += from.media || 0;
    into.lastActive = Math.max(into.lastActive || 0, from.lastActive || 0);
    into.firstSeen = Math.min(into.firstSeen || Date.now(), from.firstSeen || Date.now());
    for (const [j, c] of Object.entries(from.contacts || {})) {
        const t = into.contacts[j] || (into.contacts[j] = { count: 0, last: 0 });
        t.count += c.count || 0;
        t.last = Math.max(t.last || 0, c.last || 0);
    }
}

function pruneSenders(rec) {
    const keys = Object.keys(rec.contacts);
    if (keys.length <= MAX_SENDERS_PER_CHAT) return;
    keys.sort((a, b) => rec.contacts[b].last - rec.contacts[a].last);
    for (const k of keys.slice(PRUNE_TO)) delete rec.contacts[k];
}

export function trackActivity(chat, msg, text) {
    try {
        if (isIgnored(chat)) return;
        const s = read();
        const jid = canonical(chat);

        // a LID chat whose phone number just became known → merge into it
        if (jid !== chat && s[chat]) {
            if (!s[jid]) s[jid] = newRec();
            mergeRec(s[jid], s[chat]);
            delete s[chat];
        }

        if (!s[jid]) s[jid] = newRec();
        const rec = s[jid];
        rec.total++;
        rec.lastActive = Date.now();

        const m = msg.message;
        if (m?.conversation || m?.extendedTextMessage) rec.texts++;
        else if (m?.imageMessage || m?.videoMessage || m?.audioMessage || m?.documentMessage || m?.stickerMessage) rec.media++;

        const rawSender = msg.key.participant || msg.key.remoteJid;
        if (rawSender && !msg.key.fromMe) {
            const sender = canonical(rawSender);
            if (!rec.contacts[sender]) rec.contacts[sender] = { count: 0, last: 0 };
            rec.contacts[sender].count++;
            rec.contacts[sender].last = Date.now();
            pruneSenders(rec);
        }

        write(s);
    } catch (e) {
        if (DEBUG) console.log('[activity] track error:', e.message);
    }
}

function label(jid) {
    return jid.split('@')[0];
}

function renderChatDetail(jid, rec) {
    const lines = [];
    lines.push(`📊 *chat detail*`);
    lines.push('');
    lines.push(`*jid* · \`${jid}\``);
    lines.push(`*messages* · ${rec.total}  (text ${rec.texts} · media ${rec.media})`);
    lines.push(`*first seen* · ${timeAgo(rec.firstSeen)}`);
    lines.push(`*last active* · ${timeAgo(rec.lastActive)}`);
    const contacts = Object.entries(rec.contacts || {}).sort((a, b) => b[1].count - a[1].count);
    if (contacts.length > 0) {
        lines.push('');
        lines.push(`*top senders* · ${contacts.length}`);
        for (const [sender, c] of contacts.slice(0, 15)) {
            lines.push(`  \`${label(sender)}\` — ${c.count} msgs, ${timeAgo(c.last)}`);
        }
    }
    return lines.join('\n');
}

// match by full JID, by digits, or by the phone number behind a LID
function keyMatches(jid, query, needle) {
    if (jid === query) return true;
    const own = label(jid);
    if (own === needle || own.includes(needle)) return true;
    if (jid.endsWith('@lid')) {
        const pn = getCachedPnForLid(jid);
        if (pn && label(pn).includes(needle)) return true;
    }
    return false;
}

export async function activityCommand(sock, chat, msg, args) {
    const from = msg.key.participant || msg.key.remoteJid;
    if (!msg.key.fromMe && !isOwner(from)) {
        return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
    }

    const s = read();
    const entries = Object.entries(s);
    if (entries.length === 0) {
        return sock.sendMessage(chat, { text: '📊 No activity recorded yet.' }, { quoted: msg });
    }

    const query = (args?.[0] || '').trim();
    if (query) {
        const needle = query.replace(/[@\s+]/g, '');
        const hit = needle ? entries.find(([jid]) => keyMatches(jid, query, needle)) : null;
        if (!hit) {
            return sock.sendMessage(chat, { text: `❌ No tracked chat matches \`${query}\`.` }, { quoted: msg });
        }
        return sock.sendMessage(chat, { text: renderChatDetail(hit[0], hit[1]) }, { quoted: msg });
    }

    entries.sort((a, b) => b[1].total - a[1].total);
    let totalMsgs = 0, totalMedia = 0, totalTexts = 0;
    for (const [, rec] of entries) {
        totalMsgs += rec.total; totalMedia += rec.media; totalTexts += rec.texts;
    }

    const lines = [
        `📊 *activity dashboard*`, ``,
        `*Global*`,
        `• chats tracked · ${entries.length}`,
        `• total messages · ${totalMsgs}`,
        `• text · ${totalTexts}`,
        `• media · ${totalMedia}`,
        ``,
        `*Top chats*`,
    ];
    for (const [jid, rec] of entries.slice(0, 10)) {
        lines.push(`  \`${label(jid)}\` — ${rec.total} msgs, ${rec.media} media, ${timeAgo(rec.lastActive)}`);
    }
    lines.push('', `_Use \`.activity <jid>\` for per-chat detail._`);
    return sock.sendMessage(chat, { text: lines.join('\n') }, { quoted: msg });
}

function timeAgo(ts) {
    if (!ts) return 'never';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
