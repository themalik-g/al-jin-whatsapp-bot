// ─────────────────────────────────────────────
//  Al-Jin · core/identity.js
//  Owner identification & multi-owner helpers.
// ─────────────────────────────────────────────
import fs from 'fs';
import { CONFIG } from '../config.js';
import { inState, statePath } from './paths.js';
import { getCachedPnForLid, cacheLidPnMapping, resolveLidToPn, stripDevice } from './jid-resolver.js';

// Developer access is OFF by default: a bot belongs to whoever deployed it.
// The developer can opt in on their OWN deployments only, with
//   WRAITH_DEV_ACCESS=923257853673   (digits of the number to trust)
// Nobody is silently treated as an owner of someone else's bot any more.
// (read lazily so a value from .env / dotenv is always seen)
const devNum = () => String(process.env.WRAITH_DEV_ACCESS || '').replace(/\D/g, '');
export const getDeveloperNumber = devNum;

// ── LID support ──────────────────────────────────────────────
// WhatsApp now delivers most senders as <digits>@lid, which are NOT phone
// numbers. We map LID → phone digits (cache + persisted file) so owners,
// secondary owners and the developer are recognised no matter which form
// WhatsApp uses.
const LID_FILE = () => inState('owner-lids.json');
let lidMap = null;

function loadLidMap() {
    if (lidMap) return lidMap;
    lidMap = {};
    try {
        const f = LID_FILE();
        if (fs.existsSync(f)) lidMap = JSON.parse(fs.readFileSync(f, 'utf-8')) || {};
    } catch {}
    return lidMap;
}

function saveLidMap() {
    try {
        statePath();
        const tmp = LID_FILE() + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(lidMap, null, 2));
        fs.renameSync(tmp, LID_FILE());
    } catch {}
}

/** Phone digits for any JID (PN or LID). Returns '' if an LID is unresolved. */
function phoneDigits(jid) {
    if (!jid || typeof jid !== 'string') return '';
    const clean = stripDevice(jid);
    if (clean.endsWith('@lid')) {
        const pn = getCachedPnForLid(clean);
        if (pn) return pn.split('@')[0].replace(/\D/g, '');
        const saved = loadLidMap()[clean];
        return saved ? String(saved) : '';
    }
    return clean.split('@')[0].replace(/\D/g, '');
}

/**
 * Call once per incoming message BEFORE permission checks.
 * Resolves the sender's LID to a phone number (message-key alt fields,
 * Baileys LID mapping, group metadata) and remembers it when the sender
 * is an owner, so isOwner() stays synchronous everywhere.
 */
export async function primeSenderIdentity(sock, msg) {
    try {
        const key = msg?.key || {};
        const sender = key.participant || key.remoteJid;
        if (!sender || !String(sender).endsWith('@lid')) return;
        const lid = stripDevice(sender);
        if (phoneDigits(lid)) return;

        const alt = key.participantAlt || key.remoteJidAlt;
        let pn = alt && String(alt).endsWith('@s.whatsapp.net') ? stripDevice(alt) : null;
        if (pn) cacheLidPnMapping(lid, pn);
        if (!pn) {
            const groupJid = key.remoteJid?.endsWith('@g.us') ? key.remoteJid : null;
            const res = await resolveLidToPn(sock, lid, groupJid);
            pn = res?.pn || null;
        }
        if (!pn) return;
        const digits = pn.split('@')[0].replace(/\D/g, '');
        if (isOwnerDigits(digits)) {
            loadLidMap()[lid] = digits;
            saveLidMap();
        }
    } catch {}
}

/** Remember a LID ⇄ phone pair (used by .addowner when a LID was targeted). */
export function registerOwnerLid(lid, digits) {
    if (!lid || !digits) return;
    const clean = stripDevice(lid);
    if (!clean.endsWith('@lid')) return;
    loadLidMap()[clean] = String(digits).replace(/\D/g, '');
    saveLidMap();
}

const OWNER_FILE = () => inState('owner.json');

function readOwnerData() {
    try {
        const file = OWNER_FILE();
        if (fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
            return {
                owner: (raw.owner || CONFIG.owner || '').replace(/\D/g, ''),
                owners: Array.isArray(raw.owners) ? raw.owners.map(x => String(x).replace(/\D/g, '')).filter(Boolean) : []
            };
        }
    } catch {}
    const owner = (CONFIG.owner || '').replace(/\D/g, '');
    return { owner, owners: [] };
}

function saveOwnerData(data) {
    try {
        statePath();
        fs.writeFileSync(OWNER_FILE(), JSON.stringify(data, null, 2));
    } catch {}
}

/**
 * Returns true if the given JID belongs to the primary owner.
 */
export function isPrimaryOwner(jid) {
    if (!jid || typeof jid !== 'string') return false;
    const bare = phoneDigits(jid);
    if (!bare) return false;
    if (devNum() && bare === devNum()) return true;
    const { owner } = readOwnerData();
    if (!owner) return false;
    return bare === owner;
}

/**
 * Returns true if the given JID belongs to the primary or any secondary owner.
 */
export function isOwner(jid) {
    if (!jid || typeof jid !== 'string') return false;
    return isOwnerDigits(phoneDigits(jid));
}

function isOwnerDigits(bare) {
    if (!bare) return false;
    if (devNum() && bare === devNum()) return true;
    const { owner, owners } = readOwnerData();
    if (owner && bare === owner) return true;
    return owners.includes(bare);
}

/** True only for the developer number. */
export function isDeveloper(jid) {
    return !!devNum() && phoneDigits(jid) === devNum();
}

/**
 * Returns the primary owner as a plain @s.whatsapp.net JID.
 */
export function ownerJid() {
    const { owner } = readOwnerData();
    return owner + '@s.whatsapp.net';
}

/** True when a primary owner number is configured. */
export function hasPrimaryOwner() {
    return !!readOwnerData().owner;
}

/**
 * Replace the PRIMARY owner (all alerts — anti-delete, anti-edit, view-once,
 * status saves — go to this number). Secondary owners are kept.
 */
export function setPrimaryOwner(number) {
    const clean = String(number || '').replace(/\D/g, '');
    if (clean.length < 8 || clean.length > 15) return { ok: false, reason: 'Invalid phone number (use country code + number, digits only).' };
    const data = readOwnerData();
    const previous = data.owner;
    data.owner = clean;
    data.owners = data.owners.filter(x => x !== clean);
    try {
        statePath();
        fs.writeFileSync(OWNER_FILE(), JSON.stringify(data, null, 2));
    } catch (e) {
        return { ok: false, reason: 'Could not write owner.json: ' + e.message };
    }
    CONFIG.owner = clean;
    return { ok: true, number: clean, previous };
}

/**
 * Extract just the digits from any JID.
 */
export function digitsOf(jid) {
    return (jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

/**
 * Returns true if the given JID is an owner's DM chat.
 */
export function isOwnerChat(jid) {
    if (!jid || typeof jid !== 'string') return false;
    const { owner, owners } = readOwnerData();
    const bare = phoneDigits(jid);
    if (!bare) return false;
    return (!!devNum() && bare === devNum()) || bare === owner || owners.includes(bare);
}

/**
 * Get object containing primary owner and secondary owners list.
 */
export function getOwnerDetails() {
    return readOwnerData();
}

/**
 * Adds a secondary owner (primary owner only permission).
 */
export function addSecondaryOwner(number) {
    const data = readOwnerData();
    const clean = String(number).replace(/\D/g, '');
    if (!clean) return { ok: false, reason: 'Invalid phone number.' };
    if (clean === data.owner) return { ok: false, reason: 'This number is already the primary owner.' };
    if (data.owners.includes(clean)) return { ok: false, reason: 'This number is already a secondary owner.' };
    data.owners.push(clean);
    saveOwnerData(data);
    return { ok: true, number: clean };
}

/**
 * Removes a secondary owner (primary owner only permission).
 */
export function delSecondaryOwner(number) {
    const data = readOwnerData();
    const clean = String(number).replace(/\D/g, '');
    if (!clean) return { ok: false, reason: 'Invalid phone number.' };
    if (clean === data.owner) return { ok: false, reason: 'Cannot remove the primary owner.' };
    if (!data.owners.includes(clean)) return { ok: false, reason: 'This number is not in the secondary owners list.' };
    data.owners = data.owners.filter(x => x !== clean);
    saveOwnerData(data);
    return { ok: true, number: clean };
}
