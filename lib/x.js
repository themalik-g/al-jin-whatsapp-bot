// ─────────────────────────────────────────────
//  Al-Jin · lib/x.js
//  Shared helpers for the "extras" command pack (modules/x-*.js).
//  · debounced JSON state  · LID-aware admin checks  · media download
//  · ffmpeg runner         · small text utilities
//  No new dependencies — only Baileys + Node built-ins + existing Al-Jin libs.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { inState } from '../core/paths.js';
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { isOwner } from '../core/identity.js';
import { stripDevice, getBestUserJidSync } from '../core/jid-resolver.js';
import { getPrefix } from '../core/settings.js';
import { ffmpegPath } from './ffmpeg-resolver.js';

// ── state ────────────────────────────────────
const stores = new Map();

/** Debounced, atomic JSON store. `data` is mutated in place; call save() after changes. */
export function store(name, fallback = {}) {
    if (stores.has(name)) return stores.get(name);
    const file = () => inState(`x-${name}.json`);
    const data = readJson(file(), fallback) || fallback;
    let timer = null;
    const api = {
        data,
        save() {
            clearTimeout(timer);
            timer = setTimeout(() => writeJsonAtomic(file(), data), 500);
            timer.unref?.();
        },
        flush() { clearTimeout(timer); writeJsonAtomic(file(), data); },
    };
    stores.set(name, api);
    return api;
}
process.on('exit', () => { for (const s of stores.values()) { try { s.flush(); } catch {} } });

// ── basic message helpers ────────────────────
export const isGroup = (chat) => String(chat || '').endsWith('@g.us');
export const prefix = () => getPrefix();

export function reply(sock, chat, msg, text, extra = {}) {
    return sock.sendMessage(chat, { text, ...extra }, { quoted: msg });
}

export function unwrap(m) {
    return m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message
        || m?.documentWithCaptionMessage?.message || m;
}

export function contextOf(msg) {
    const m = unwrap(msg.message) || {};
    const node = m.extendedTextMessage || m.imageMessage || m.videoMessage || m.documentMessage
        || m.audioMessage || m.stickerMessage || m.buttonsResponseMessage || {};
    return node.contextInfo || null;
}

export function quotedOf(msg) {
    const ctx = contextOf(msg);
    return ctx?.quotedMessage ? { message: unwrap(ctx.quotedMessage), ctx } : null;
}

export function textOfMessage(m) {
    m = unwrap(m) || {};
    return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption
        || m.videoMessage?.caption || m.documentMessage?.caption || '').trim();
}

/** Text from the command arguments, or from the replied-to message when no args were typed. */
export function argOrQuoted(msg, args) {
    const typed = (args || []).join(' ').trim();
    if (typed) return typed;
    const q = quotedOf(msg);
    return q ? textOfMessage(q.message) : '';
}

// ── identity ─────────────────────────────────
const digits = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** Every id the sender may be known by (LID + phone number), normalised. */
export function senderIds(msg) {
    const k = msg.key || {};
    const out = new Set();
    for (const raw of [k.participant, k.participantAlt, k.remoteJid]) {
        if (!raw || String(raw).endsWith('@g.us')) continue;
        out.add(stripDevice(raw));
        try { out.add(stripDevice(getBestUserJidSync(raw))); } catch {}
    }
    return [...out].filter(Boolean);
}

export const senderJid = (msg) => stripDevice(msg.key.participant || msg.key.remoteJid);

export function isOwnerMsg(msg) {
    return !!msg.key.fromMe || senderIds(msg).some((j) => isOwner(j));
}

export function sameUser(a, b) {
    if (!a || !b) return false;
    const A = stripDevice(a), B = stripDevice(b);
    return A === B || (digits(A) && digits(A) === digits(B) && A.split('@')[1] === B.split('@')[1]);
}

const participantIds = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(stripDevice);

// ── groups ───────────────────────────────────
const metaCache = new Map();

export async function groupMeta(sock, chat, fresh = false) {
    const hit = metaCache.get(chat);
    if (!fresh && hit && Date.now() - hit.at < 20000) return hit.meta;
    const meta = await sock.groupMetadata(chat);
    metaCache.set(chat, { at: Date.now(), meta });
    if (metaCache.size > 200) metaCache.delete(metaCache.keys().next().value);
    return meta;
}

export function findParticipant(meta, ids) {
    const want = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(stripDevice));
    return (meta.participants || []).find((p) => participantIds(p).some((x) => want.has(x))) || null;
}

export const isAdminP = (p) => !!p && (p.admin === 'admin' || p.admin === 'superadmin' || p.admin === true);

export async function isSenderAdmin(sock, chat, msg) {
    if (isOwnerMsg(msg)) return true;
    try { return isAdminP(findParticipant(await groupMeta(sock, chat), senderIds(msg))); } catch { return false; }
}

export async function isBotAdmin(sock, chat) {
    try {
        const meta = await groupMeta(sock, chat);
        const me = [sock.user?.id, sock.user?.lid].filter(Boolean);
        return isAdminP(findParticipant(meta, me));
    } catch { return false; }
}

/** JID to use in `mentions` / group actions for a participant object. */
export const pJid = (p) => p.id;
export const tag = (jid) => `@${digits(jid)}`;

/** Parse a target user from mention → reply → typed number. Returns a jid string or null. */
export function targetJid(msg, args = []) {
    const ctx = contextOf(msg);
    if (ctx?.mentionedJid?.length) return stripDevice(ctx.mentionedJid[0]);
    if (ctx?.participant && ctx.quotedMessage) return stripDevice(ctx.participant);
    for (const a of args) {
        const d = String(a).replace(/\D/g, '');
        if (d.length >= 7 && d.length <= 15) return `${d}@s.whatsapp.net`;
    }
    return null;
}

// ── media ────────────────────────────────────
const MEDIA_KINDS = [
    ['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio'],
    ['stickerMessage', 'sticker'], ['documentMessage', 'document'],
];

/** Finds media in the message itself or in the replied-to message. */
export function findMedia(msg, want = null) {
    const own = unwrap(msg.message) || {};
    const q = quotedOf(msg)?.message || {};
    for (const src of [own, q]) {
        for (const [key, kind] of MEDIA_KINDS) {
            if (src[key] && (!want || want.includes(kind))) return { node: src[key], kind, mime: src[key].mimetype || '' };
        }
    }
    return null;
}

export async function mediaBuffer(media, maxBytes = 40 * 1024 * 1024) {
    const stream = await downloadContentFromMessage(media.node, media.kind);
    const chunks = [];
    let size = 0;
    for await (const c of stream) {
        size += c.length;
        if (size > maxBytes) throw new Error('file is too large');
        chunks.push(c);
    }
    return Buffer.concat(chunks);
}

// ── temp files + ffmpeg ──────────────────────
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const tmpFile = (ext = '') => path.join(os.tmpdir(), `aljin_${uid()}${ext}`);

export async function withTmp(exts, fn) {
    const files = exts.map((e) => tmpFile(e));
    try { return await fn(...files); }
    finally { for (const f of files) { try { fs.unlinkSync(f); } catch {} } }
}

export function ffmpeg(args, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
        execFile(ffmpegPath, ['-y', '-v', 'error', ...args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => {
            if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').pop() || 'ffmpeg failed'));
            resolve();
        });
    });
}

let _filters = null;
export async function ffmpegHasFilter(name) {
    if (!_filters) {
        _filters = await new Promise((res) => execFile(ffmpegPath, ['-hide_banner', '-filters'], { timeout: 8000 }, (_e, out) => res(String(out || ''))));
    }
    return new RegExp(`\\s${name}\\s`).test(_filters);
}

// ── text utils ───────────────────────────────
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function duration(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(' ');
}

export const bytesToSize = (n) => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
    return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

/** Deterministic 0-99 number from two names so `.ship a b` is stable. */
export function stableScore(a, b) {
    const s = [String(a).toLowerCase(), String(b).toLowerCase()].sort().join('|');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h) % 101;
}

export const bar = (pct, len = 10) => '█'.repeat(Math.round((pct / 100) * len)) + '░'.repeat(len - Math.round((pct / 100) * len));

export const usage = (sock, chat, msg, lines) => reply(sock, chat, msg, Array.isArray(lines) ? lines.join('\n') : lines);

/** Wrap a handler so a failure is reported in chat instead of throwing. */
export const safe = (name, fn) => async (sock, chat, msg, args, ctx) => {
    try { return await fn(sock, chat, msg, args || [], ctx || {}); }
    catch (e) {
        console.error(`[x:${name}]`, e?.message);
        try { await reply(sock, chat, msg, `⚠️ *${name}* failed — ${e?.message || 'unknown error'}`); } catch {}
    }
};
