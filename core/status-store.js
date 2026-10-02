// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · core/status-store.js  (v2)
// Captures and indexes incoming WhatsApp status stories (status@broadcast)
//
// v2 fixes
//  • `.getstatus` finds stories whether the poster arrived as a LID or a
//    phone number (v1 compared digits only, so LID senders were missed)
//  • oversized media is skipped (never downloads above the size guard)
//  • a failed download no longer leaves a half-written file in the vault
//  • the index is saved atomically (crash-safe)
// ─────────────────────────────────────────────
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { vaultPath, vaultMediaName, dropFromVault } from './vault.js';
import { getBestUserJid, getBestUserJidSync, digitsOf } from './jid-resolver.js';
import { writeJsonAtomic } from './state-io.js';
import { inState } from './paths.js';

const STATE_FILE = () => inState('status-store.json');
const STATUS_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;  // skip stories bigger than 30 MB
const DEBUG = process.env.MEHTAB_MD_DEBUG === '1';

const statusStore = new Map(); // id -> statusObj
let saveTimer = null;

function loadStatusStore() {
    try {
        const file = STATE_FILE();
        if (!fs.existsSync(file)) return;
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const cutoff = Date.now() - STATUS_TTL_MS;
        for (const [id, rec] of Object.entries(raw)) {
            if (rec?.at >= cutoff) {
                statusStore.set(id, rec);
            } else if (rec?.file) {
                dropFromVault(rec.file);
            }
        }
        if (DEBUG) console.log(`[status-store] loaded ${statusStore.size} active status stories`);
    } catch (e) {
        if (DEBUG) console.log('[status-store] load failed:', e.message);
    }
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            writeJsonAtomic(STATE_FILE(), Object.fromEntries(statusStore));
        } catch (e) {
            if (DEBUG) console.log('[status-store] save failed:', e.message);
        }
    }, 3000);
    if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

loadStatusStore();

// Sweeper every 10 minutes to remove expired status stories & files
const sweeper = setInterval(() => {
    try {
        const cutoff = Date.now() - STATUS_TTL_MS;
        let changed = false;
        for (const [id, rec] of statusStore.entries()) {
            if (rec.at < cutoff) {
                if (rec.file) dropFromVault(rec.file);
                statusStore.delete(id);
                changed = true;
            }
        }
        if (changed) scheduleSave();
    } catch {}
}, 10 * 60 * 1000);
if (typeof sweeper.unref === 'function') sweeper.unref();

function toNumber(v) {
    if (v == null) return 0;
    return Number(v.toString()) || 0; // handles protobuf Long values
}

function extractStatusNode(m) {
    if (!m) return { node: null, type: null, caption: '' };
    const wrapped =
        m.viewOnceMessageV2?.message ||
        m.viewOnceMessageV2Extension?.message ||
        m.viewOnceMessage?.message ||
        m.ephemeralMessage?.message ||
        m;

    if (wrapped.imageMessage) {
        return { node: wrapped.imageMessage, type: 'image', caption: wrapped.imageMessage.caption || '' };
    }
    if (wrapped.videoMessage) {
        return { node: wrapped.videoMessage, type: 'video', caption: wrapped.videoMessage.caption || '' };
    }
    if (wrapped.audioMessage) {
        return { node: wrapped.audioMessage, type: 'audio', caption: wrapped.audioMessage.caption || '' };
    }
    const text = (wrapped.conversation || wrapped.extendedTextMessage?.text || '').trim();
    if (text) {
        return { node: wrapped.extendedTextMessage || wrapped, type: 'text', caption: text };
    }
    return { node: null, type: null, caption: '' };
}

function collectStatusCandidates(payload) {
    const out = [];
    const seen = new Set();

    function push(key, msg) {
        if (!key?.id) return;
        if (key.remoteJid !== 'status@broadcast') return;
        if (seen.has(key.id)) return;
        seen.add(key.id);
        out.push({ key, msg: msg || null });
    }

    if (Array.isArray(payload)) {
        for (const k of payload) push(k, null);
    }
    if (Array.isArray(payload?.messages)) {
        for (const m of payload.messages) push(m?.key, m);
    }
    if (Array.isArray(payload?.keys)) {
        for (const k of payload.keys) push(k, null);
    }
    if (payload?.key?.remoteJid === 'status@broadcast') {
        push(payload.key, payload.message ? payload : null);
    }
    return out;
}

/**
 * Capture incoming status@broadcast updates into statusStore
 */
export async function captureStatusStory(sock, payload) {
    const candidates = collectStatusCandidates(payload);
    if (!candidates.length) return;

    for (const { key, msg } of candidates) {
        let partialFile = null;
        try {
            if (!key?.id) continue;
            if (statusStore.has(key.id)) continue;

            const rawSender = key.participant || key.remoteJid;
            if (!rawSender || rawSender === 'status@broadcast') continue;

            const bestSender = await getBestUserJid(rawSender, sock);
            const senderDigits = digitsOf(bestSender);
            if (!senderDigits) continue;

            const m = msg?.message;
            if (!m) continue;

            const { node, type, caption } = extractStatusNode(m);
            if (!type) continue;

            if ((type === 'image' || type === 'video' || type === 'audio') && toNumber(node?.fileLength) > MAX_MEDIA_BYTES) {
                if (DEBUG) console.log(`[status-store] skipped oversized ${type} status from ${senderDigits}`);
                continue;
            }

            const record = {
                id: key.id,
                sender: bestSender,
                rawSender,                      // as delivered (may be a LID)
                senderDigits,
                type,
                caption,
                file: null,
                mimetype: node?.mimetype || null,
                at: Date.now()
            };

            if (type === 'image' || type === 'video' || type === 'audio') {
                const ext = type === 'image' ? 'jpg' : (type === 'video' ? 'mp4' : 'ogg');
                const fp = vaultPath(vaultMediaName(bestSender, 'status_story', key.id, ext));
                partialFile = fp;
                const stream = await downloadContentFromMessage(node, type);
                await pipeline(stream, fs.createWriteStream(fp));
                record.file = fp;
                partialFile = null;
            }

            statusStore.set(key.id, record);
            scheduleSave();
            if (DEBUG) console.log(`[status-store] captured ${type} status from ${senderDigits} (${key.id})`);
        } catch (e) {
            if (partialFile) { try { dropFromVault(partialFile); } catch {} }
            if (DEBUG) console.log('[status-store] capture error:', e.message);
        }
    }
}

// every digit-string a JID could be known by (phone number, LID, resolved forms)
function identities(jid) {
    const out = new Set();
    if (!jid) return out;
    for (const j of [jid, getBestUserJidSync(jid)]) {
        const d = digitsOf(j);
        if (d) out.add(d);
    }
    return out;
}

/**
 * Get active status stories (within 24 hours) for a given target user
 */
export function getStatusStoriesForUser(targetJid) {
    const wanted = identities(targetJid);
    if (!wanted.size) return [];

    const cutoff = Date.now() - STATUS_TTL_MS;
    const stories = [];

    for (const rec of statusStore.values()) {
        if (rec.at < cutoff) continue;

        const poster = new Set([rec.senderDigits, ...identities(rec.sender), ...identities(rec.rawSender)]);
        let match = false;
        for (const d of wanted) { if (poster.has(d)) { match = true; break; } }
        if (!match) continue;

        // Verify file still exists if media
        if (rec.file && !fs.existsSync(rec.file)) continue;
        stories.push(rec);
    }

    // Sort by timestamp ascending (chronological order)
    stories.sort((a, b) => a.at - b.at);
    return stories;
}
