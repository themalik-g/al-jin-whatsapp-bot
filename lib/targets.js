// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · lib/targets.js
// Small shared helpers for the owner-only spy/guard commands.
// ─────────────────────────────────────────────
import { isOwner, ownerJid } from '../core/identity.js';
import { digitsOf, getBestUserJid } from '../core/jid-resolver.js';

/** Who is the command about? mention → typed number → replied-to user → (optionally) this private chat. */
export async function getTarget(sock, chat, msg, args = [], { useChat = false } = {}) {
    const ctx = msg?.message?.extendedTextMessage?.contextInfo;
    let raw = ctx?.mentionedJid?.[0] || null;
    if (!raw) {
        for (const a of args) {
            const s = String(a);
            const d = s.replace(/\D/g, '');
            if (/^[@+]?\d[\d\s-]{5,}$/.test(s) && d.length >= 7 && d.length <= 15) { raw = `${d}@s.whatsapp.net`; break; }
        }
    }
    if (!raw && ctx?.participant) raw = ctx.participant;
    if (!raw && useChat && /@(s\.whatsapp\.net|lid)$/.test(String(chat))) raw = chat;
    if (!raw) return null;
    const jid = await getBestUserJid(raw, sock, String(chat).endsWith('@g.us') ? chat : null);
    return { jid, raw, digits: digitsOf(jid) };
}

/** Sends "Owner only." and returns true when the sender is not an owner. */
export function ownerOnly(sock, chat, msg) {
    const from = msg.key.participant || msg.key.remoteJid;
    if (!msg.key.fromMe && !isOwner(from)) {
        sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg }).catch(() => {});
        return true;
    }
    return false;
}

/** Private message to the primary owner. Never throws. */
export async function notifyOwner(sock, content) {
    try {
        const to = ownerJid();
        if (!to || to.startsWith('@')) return;
        await sock.sendMessage(to, typeof content === 'string' ? { text: content } : content);
    } catch { /* ignore */ }
}
