// ─────────────────────────────────────────────
// WRAITH · modules/spy.js
//   .statusalert  — alert when chosen people post a status
//   .watch        — alert when chosen people change profile picture / About / name
//   .ginfo        — inspect a group from its invite link without joining
// startSpy(sock) attaches all listeners once per socket (called from presence.js).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { inState } from '../core/paths.js';
import { CONFIG } from '../config.js';
import { digitsOf, getBestUserJid, getBestUserJidSync } from '../core/jid-resolver.js';
import { getStatusStoriesForUser } from '../core/status-store.js';
import { fetchBuffer } from '../lib/net.js';
import { getTarget, ownerOnly, notifyOwner } from '../lib/targets.js';
import { startNoAction } from './noaction.js';

const DEBUG = process.env.WRAITH_DEBUG === '1';
const FILE = () => inState('spy.json');
const WATCH_DIR = () => inState('watch');
const POLL_MS = 30 * 60_000;
const tz = () => CONFIG.timezone || 'Asia/Karachi';
const fmt = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: tz() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cache = null;
function S() {
    if (!cache) {
        const raw = readJson(FILE(), {});
        cache = { statusAlert: raw.statusAlert || {}, watch: raw.watch || {} };
    }
    return cache;
}
function save() { writeJsonAtomic(FILE(), cache); }

// ── status alerts ───────────────────────────────────────────────────────────
const seenStatus = new Set();

function unwrap(m) {
    return m?.viewOnceMessageV2?.message || m?.viewOnceMessage?.message || m?.ephemeralMessage?.message || m;
}

function statusKind(message) {
    const m = unwrap(message) || {};
    if (m.imageMessage) return { type: 'image', caption: m.imageMessage.caption || '' };
    if (m.videoMessage) return { type: 'video', caption: m.videoMessage.caption || '' };
    if (m.audioMessage) return { type: 'audio', caption: '' };
    const text = m.conversation || m.extendedTextMessage?.text || '';
    return { type: text ? 'text' : 'other', caption: text };
}

async function forwardStory(sock, best, id, header) {
    for (const wait of [3000, 5000, 8000]) {
        await sleep(wait);
        const rec = getStatusStoriesForUser(best).find((r) => r.id === id);
        if (!rec || !rec.file || !fs.existsSync(rec.file)) continue;
        const cap = `${header}${rec.caption ? `\n\n${rec.caption}` : ''}`;
        if (rec.type === 'image') return notifyOwner(sock, { image: { url: rec.file }, caption: cap });
        if (rec.type === 'video') return notifyOwner(sock, { video: { url: rec.file }, caption: cap });
        if (rec.type === 'audio') return notifyOwner(sock, { audio: { url: rec.file }, mimetype: rec.mimetype || 'audio/mp4' });
        return;
    }
}

async function onStatusPost(sock, upsert) {
    const alerts = S().statusAlert;
    if (!Object.keys(alerts).length) return;
    for (const m of upsert?.messages || []) {
        if (m?.key?.remoteJid !== 'status@broadcast' || m.key.fromMe || !m.message) continue;
        const raw = m.key.participant;
        if (!raw || seenStatus.has(m.key.id)) continue;
        const best = await getBestUserJid(raw, sock);
        const d = digitsOf(best);
        if (!alerts[d]) continue;
        seenStatus.add(m.key.id);
        if (seenStatus.size > 300) seenStatus.delete(seenStatus.values().next().value);

        const { type, caption } = statusKind(m.message);
        const header = `📣 +${d} posted a status · ${type} · ${fmt(Date.now())}`;
        if (type === 'text') await notifyOwner(sock, `${header}\n\n"${caption.slice(0, 500)}"`);
        else if (type === 'other') await notifyOwner(sock, header);
        else { await notifyOwner(sock, header); forwardStory(sock, best, m.key.id, `📣 +${d}`).catch(() => {}); }
    }
}

// ── profile watch ───────────────────────────────────────────────────────────
const picKey = (url) => { try { return new URL(url).pathname; } catch { return String(url); } };
const picFile = (d) => path.join(WATCH_DIR(), `${d}.jpg`);
function readPic(d) { try { return fs.readFileSync(picFile(d)); } catch { return null; } }
function writePic(d, buf) { fs.mkdirSync(WATCH_DIR(), { recursive: true }); fs.writeFileSync(picFile(d), buf); }
function removePic(d) { try { fs.unlinkSync(picFile(d)); } catch { /* none */ } }

async function checkWatched(sock, d) {
    const rec = S().watch[d];
    if (!rec) return null;
    const out = { pic: 'unavailable', about: null };

    // picture — 404 means "no picture"; any other error is treated as "cannot tell" (never as a change)
    let url = null, known = true;
    try { url = await sock.profilePictureUrl(rec.jid, 'image'); }
    catch (e) {
        const code = e?.output?.statusCode || e?.data;
        if (code === 404 || /item-not-found/.test(e?.message || '')) url = null; else known = false;
    }
    if (known) {
        const key = url ? picKey(url) : 'none';
        out.pic = url ? 'saved' : 'none';
        if (rec.pic === undefined) {
            rec.pic = key;
            if (url) { try { writePic(d, await fetchBuffer(url, { maxBytes: 4 * 1024 * 1024 })); } catch { /* ignore */ } }
        } else if (key !== rec.pic) {
            const old = readPic(d);
            rec.pic = key;
            if (url) {
                let fresh = null;
                try { fresh = await fetchBuffer(url, { maxBytes: 4 * 1024 * 1024 }); } catch { /* ignore */ }
                if (old) await notifyOwner(sock, { image: old, caption: `🖼️ +${d} · previous profile picture` });
                if (fresh) { await notifyOwner(sock, { image: fresh, caption: `🖼️ +${d} changed their profile picture · ${fmt(Date.now())}` }); writePic(d, fresh); }
                else await notifyOwner(sock, `🖼️ +${d} changed their profile picture (could not download it)`);
            } else {
                if (old) await notifyOwner(sock, { image: old, caption: `🖼️ +${d} REMOVED their profile picture · ${fmt(Date.now())}` });
                else await notifyOwner(sock, `🖼️ +${d} removed their profile picture · ${fmt(Date.now())}`);
                removePic(d);
            }
        }
    }

    // About
    try {
        const res = await sock.fetchStatus(rec.jid);
        const first = Array.isArray(res) ? res[0] : res;
        const node = first?.status ?? first;
        const text = typeof node === 'string' ? node : node?.status;
        if (typeof text === 'string') {
            out.about = text;
            if (rec.about === undefined) rec.about = text;
            else if (text !== rec.about) {
                await notifyOwner(sock, `📝 +${d} changed their About\n\nbefore: ${rec.about || '—'}\nnow: ${text || '—'}`);
                rec.about = text;
            }
        }
    } catch { /* hidden or unavailable */ }

    save();
    return out;
}

async function pollWatched(sock) {
    for (const d of Object.keys(S().watch)) {
        await checkWatched(sock, d).catch(() => {});
        await sleep(2000);
    }
}

const debounce = new Map();
async function onContacts(sock, updates) {
    const w = S().watch;
    if (!Object.keys(w).length) return;
    for (const u of updates || []) {
        const d = digitsOf(getBestUserJidSync(u?.id));
        const rec = w[d];
        if (!rec) continue;
        if ('imgUrl' in u && !debounce.has(d)) {
            const t = setTimeout(() => { debounce.delete(d); checkWatched(sock, d).catch(() => {}); }, 4000);
            t.unref?.();
            debounce.set(d, t);
        }
        if (u.notify && u.notify !== rec.name) {
            if (rec.name) await notifyOwner(sock, `🏷️ +${d} changed their name\n\nbefore: ${rec.name}\nnow: ${u.notify}`);
            rec.name = u.notify;
            save();
        }
    }
}

// ── lifecycle ───────────────────────────────────────────────────────────────
const attached = new WeakSet();

export function startSpy(sock) {
    if (!sock?.ev || attached.has(sock)) return;
    attached.add(sock);
    try {
        startNoAction(sock);
        sock.ev.on('messages.upsert', (u) => { onStatusPost(sock, u).catch((e) => { if (DEBUG) console.log('[spy:status]', e.message); }); });
        sock.ev.on('contacts.update', (u) => { onContacts(sock, u).catch((e) => { if (DEBUG) console.log('[spy:contacts]', e.message); }); });
        const timer = setInterval(() => { pollWatched(sock).catch(() => {}); }, POLL_MS);
        timer.unref?.();
        sock.ev.on('connection.update', ({ connection }) => { if (connection === 'close') clearInterval(timer); });
    } catch (e) {
        console.error('[spy] start failed:', e.message);
    }
}

// ── commands ────────────────────────────────────────────────────────────────
export async function statusalertCommand(sock, chat, msg, args) {
    if (ownerOnly(sock, chat, msg)) return;
    const say = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const a0 = (args?.[0] || '').toLowerCase();
        const list = S().statusAlert;
        if (a0 === 'list') {
            const keys = Object.keys(list);
            return say(keys.length ? `📣 *status alerts* · ${keys.length}\n\n${keys.map((d) => `• +${d}`).join('\n')}` : '📣 No status alerts set.');
        }
        const off = a0 === 'off' || a0 === 'remove';
        const t = await getTarget(sock, chat, msg, off ? args.slice(1) : args, { useChat: true });
        if (!t) return say('📣 *statusalert*\n\n`.statusalert <number>` — alert when they post\n`.statusalert off <number>`\n`.statusalert list`\n\n_Also works by replying to them or inside their private chat._');
        if (off) {
            if (!list[t.digits]) return say(`❌ +${t.digits} has no status alert.`);
            delete list[t.digits]; save();
            return say(`📣 Status alert removed for +${t.digits}.`);
        }
        list[t.digits] = { since: Date.now() };
        save();
        return say(`📣 You will get a message (and the media) whenever +${t.digits} posts a status.`);
    } catch (e) { return say(`⚠️ statusalert failed: ${e.message}`).catch(() => {}); }
}

export async function watchCommand(sock, chat, msg, args) {
    if (ownerOnly(sock, chat, msg)) return;
    const say = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const a0 = (args?.[0] || '').toLowerCase();
        const w = S().watch;
        if (a0 === 'list') {
            const keys = Object.keys(w);
            return say(keys.length ? `👀 *watching* · ${keys.length}\n\n${keys.map((d) => `• +${d}`).join('\n')}` : '👀 Nobody is being watched.');
        }
        const off = a0 === 'off' || a0 === 'remove';
        const t = await getTarget(sock, chat, msg, off ? args.slice(1) : args, { useChat: true });
        if (!t) return say('👀 *watch*\n\n`.watch <number>` — alert on profile picture / About / name change\n`.watch off <number>`\n`.watch list`');
        if (off) {
            if (!w[t.digits]) return say(`❌ +${t.digits} is not watched.`);
            delete w[t.digits]; save(); removePic(t.digits);
            return say(`👀 Stopped watching +${t.digits}.`);
        }
        w[t.digits] = { jid: t.jid, since: Date.now() };
        save();
        const r = await checkWatched(sock, t.digits);
        const lines = [`👀 Watching +${t.digits}`, ''];
        lines.push(`• picture · ${r?.pic === 'saved' ? 'saved as baseline' : r?.pic === 'none' ? 'none set' : 'not visible (privacy)'}`);
        lines.push(`• About · ${r?.about ? `"${r.about.slice(0, 80)}"` : 'not visible'}`);
        lines.push('', '_You get an alert on any change. Checked on WhatsApp events and every 30 min._');
        return say(lines.join('\n'));
    } catch (e) { return say(`⚠️ watch failed: ${e.message}`).catch(() => {}); }
}

export async function ginfoCommand(sock, chat, msg, args) {
    if (ownerOnly(sock, chat, msg)) return;
    const say = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage?.conversation || ctx?.quotedMessage?.extendedTextMessage?.text || '';
        const source = `${(args || []).join(' ')} ${quoted}`;
        const m = /chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/.exec(source) || /^\s*([A-Za-z0-9]{20,24})\s*$/.exec((args || []).join(' '));
        if (!m) return say('🔎 *ginfo*\n\n`.ginfo <chat.whatsapp.com/link>` — group details without joining');

        let info;
        try { info = await sock.groupGetInviteInfo(m[1]); }
        catch { return say('❌ Could not read that link (invalid, revoked or expired).'); }

        const owner = digitsOf(getBestUserJidSync(info.ownerPn || info.owner || ''));
        const lines = [
            '🔎 *group info*', '',
            `*name* · ${info.subject || '—'}`,
            `*members* · ${info.size ?? '—'}`,
            `*created* · ${info.creation ? fmt(Number(info.creation) * 1000) : '—'}`,
            `*creator* · ${owner ? `+${owner}` : 'unknown'}`,
            `*id* · \`${info.id || '—'}\``
        ];
        const flags = [];
        if (info.announce) flags.push('only admins can send');
        if (info.restrict) flags.push('only admins edit info');
        if (info.joinApprovalMode) flags.push('join approval on');
        if (flags.length) lines.push(`*settings* · ${flags.join(' · ')}`);
        if (info.desc) lines.push('', '*description*', String(info.desc).slice(0, 700));
        return say(lines.join('\n'));
    } catch (e) { return say(`⚠️ ginfo failed: ${e.message}`).catch(() => {}); }
}
