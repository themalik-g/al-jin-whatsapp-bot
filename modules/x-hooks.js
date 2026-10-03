// ─────────────────────────────────────────────
//  Al-Jin · modules/x-hooks.js
//  Passive behaviour for the extras pack. Called from router.js (every message)
//  and core/groupEvents.js (membership changes). Everything is opt-in per group
//  and costs one object lookup when disabled.
//
//  message hook : bans · pm-blocker · afk · antiword · antitag · antigm
//                 · filters · auto-react · per-member message stats
//  member hook  : antifake · "who left" log
// ─────────────────────────────────────────────
import { store, isGroup, senderIds, isOwnerMsg, prefix, isSenderAdmin, isBotAdmin, tag, duration, contextOf, unwrap, pick } from '../lib/x.js';

export const groupCfg = () => store('group', {});
export const globalCfg = () => {
    const s = store('global', {});
    s.data.banned ||= [];
    s.data.aliases ||= {};
    s.data.afk ||= {};
    s.data.gfilters ||= {};
    s.data.pm ||= { mode: 'off', allow: [], notice: '🔒 This number does not accept private messages. Please contact the owner another way.' };
    return s;
};
export const statsStore = () => store('stats', {});
export const leftStore = () => store('left', {});

export function cfgOf(chat) {
    const s = groupCfg();
    s.data[chat] ||= {};
    return s.data[chat];
}

const digitsOf = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const lastReply = new Map();       // chat → ts (filter / react throttle)
const pmNoticed = new Map();       // sender → ts
const recent = (map, key, ms) => {
    const now = Date.now();
    if (now - (map.get(key) || 0) < ms) return true;
    map.set(key, now);
    if (map.size > 500) map.delete(map.keys().next().value);
    return false;
};

/** Primary user key for stats: phone digits when we know them, else LID digits. */
export function userKey(msg) {
    const ids = senderIds(msg);
    const pn = ids.find((j) => j.endsWith('@s.whatsapp.net'));
    return digitsOf(pn || ids[0]);
}

// ── alias resolution (used by router before dispatch) ──────────────────
export function resolveAlias(verb, args) {
    const target = globalCfg().data.aliases[verb];
    if (!target) return null;
    const parts = String(target).trim().split(/\s+/);
    return { verb: parts[0].toLowerCase(), args: [...parts.slice(1), ...args] };
}

// ── helpers ────────────────────────────────────
function textHasWord(text, word) {
    const t = text.toLowerCase();
    const w = word.toLowerCase();
    if (/^[\p{L}\p{N}_]+$/u.test(w)) return new RegExp(`(^|[^\\p{L}\\p{N}_])${w}($|[^\\p{L}\\p{N}_])`, 'u').test(t);
    return t.includes(w);
}

async function del(sock, chat, msg) {
    try { await sock.sendMessage(chat, { delete: msg.key }); return true; } catch { return false; }
}

// ── the message hook ───────────────────────────
/** @returns {Promise<boolean>} true when the message was consumed and must not reach the command router. */
export async function onMessage(sock, chat, msg, text) {
    if (!msg?.message || chat === 'status@broadcast') return false;
    const fromMe = !!msg.key.fromMe;
    const g = globalCfg().data;
    const ids = senderIds(msg);

    // bot-level ban → ignore commands only (chat stays readable)
    if (!fromMe && g.banned.length && text.startsWith(prefix())) {
        const ds = ids.map(digitsOf);
        if (g.banned.some((b) => ds.includes(b))) return true;
    }

    // private chats
    if (!isGroup(chat)) {
        if (fromMe || isOwnerMsg(msg)) return false;
        if (g.pm.mode !== 'off' && !g.pm.allow.some((a) => ids.map(digitsOf).includes(a))) {
            const who = ids[0] || chat;
            if (!recent(pmNoticed, who, 6 * 3600 * 1000)) {
                try { await sock.sendMessage(chat, { text: g.pm.notice }); } catch {}
            }
            if (g.pm.mode === 'block') { try { await sock.updateBlockStatus(chat, 'block'); } catch {} return true; }
        }
        return false;
    }

    if (fromMe) return false;
    const cfg = groupCfg().data[chat];
    const key = userKey(msg);

    // stats (cheap, always on once the bot is in the group)
    {
        const st = statsStore();
        const room = (st.data[chat] ||= {});
        const row = (room[key] ||= { n: 0, last: 0 });
        row.n++; row.last = Date.now();
        st.save();
    }

    // afk: owner of the status returns / someone pings an afk user
    {
        const afk = g.afk;
        const mine = ids.map(digitsOf).find((d) => afk[d]);
        if (mine) {
            const rec = afk[mine];
            for (const d of ids.map(digitsOf)) delete afk[d];
            globalCfg().save();
            try { await sock.sendMessage(chat, { text: `👋 welcome back ${tag(ids[0])} — you were afk for ${duration(Date.now() - rec.since)}.`, mentions: [ids[0]] }, { quoted: msg }); } catch {}
        } else if (Object.keys(afk).length) {
            const ctx = contextOf(msg);
            const hit = [...(ctx?.mentionedJid || []), ctx?.participant].filter(Boolean).map(digitsOf).find((d) => afk[d]);
            if (hit && !recent(lastReply, `afk:${chat}:${hit}`, 30000)) {
                const rec = afk[hit];
                try { await sock.sendMessage(chat, { text: `💤 @${hit} is afk (${duration(Date.now() - rec.since)})${rec.reason ? `\n_${rec.reason}_` : ''}`, mentions: [`${hit}@s.whatsapp.net`] }, { quoted: msg }); } catch {}
            }
        }
    }

    if (!cfg) { return runGlobalFilters(sock, chat, msg, text, g); }

    // moderation — admins and owners are exempt
    const m = unwrap(msg.message) || {};
    const ctx = contextOf(msg);
    const wantsMod = cfg.antiword?.on || cfg.antitag?.on || cfg.antigm?.on;
    if (wantsMod && !(await isSenderAdmin(sock, chat, msg))) {
        // antigm: group-status mention spam
        if (cfg.antigm?.on) {
            const pt = m.protocolMessage?.type;
            if (m.groupStatusMentionMessage || pt === 25 || pt === 'STATUS_MENTION_MESSAGE') {
                if (await del(sock, chat, msg)) return true;
            }
        }
        // antitag: mass mentions / @everyone
        if (cfg.antitag?.on) {
            const n = (ctx?.mentionedJid?.length || 0) + (ctx?.nonJidMentions ? 1000 : 0);
            if (n > (cfg.antitag.max || 5)) {
                if (await del(sock, chat, msg)) {
                    try { await sock.sendMessage(chat, { text: `🚫 ${tag(ids[0])} mass-tagging is not allowed here.`, mentions: [ids[0]] }); } catch {}
                    return true;
                }
            }
        }
        // antiword
        if (cfg.antiword?.on && text && cfg.antiword.words?.length) {
            const bad = cfg.antiword.words.find((w) => textHasWord(text, w));
            if (bad) {
                await del(sock, chat, msg);
                const aw = cfg.antiword;
                aw.strikes ||= {};
                aw.strikes[key] = (aw.strikes[key] || 0) + 1;
                const left = (aw.limit || 3) - aw.strikes[key];
                groupCfg().save();
                if (aw.action === 'kick' && left <= 0) {
                    aw.strikes[key] = 0;
                    if (await isBotAdmin(sock, chat)) {
                        try { await sock.groupParticipantsUpdate(chat, [ids[0]], 'remove'); } catch {}
                        try { await sock.sendMessage(chat, { text: `⛔ ${tag(ids[0])} removed for repeated banned words.`, mentions: [ids[0]] }); } catch {}
                    }
                } else if (aw.action === 'kick') {
                    try { await sock.sendMessage(chat, { text: `⚠️ ${tag(ids[0])} banned word detected — ${left} strike(s) left.`, mentions: [ids[0]] }); } catch {}
                }
                return true;
            }
        }
    }

    // filters (auto replies)
    if (text && !text.startsWith(prefix())) {
        if (await runFilters(sock, chat, msg, text, cfg.filters)) return false;
        if (await runFilters(sock, chat, msg, text, g.gfilters)) return false;
    }

    // auto-react
    if (cfg.areact?.on && !recent(lastReply, `react:${chat}`, 1500)) {
        try { await sock.sendMessage(chat, { react: { text: pick(cfg.areact.emoji?.length ? cfg.areact.emoji : ['👍', '❤️', '😂', '🔥']), key: msg.key } }); } catch {}
    }
    return false;
}

async function runGlobalFilters(sock, chat, msg, text, g) {
    if (text && !text.startsWith(prefix())) await runFilters(sock, chat, msg, text, g.gfilters);
    return false;
}

async function runFilters(sock, chat, msg, text, map) {
    if (!map) return false;
    const keys = Object.keys(map);
    if (!keys.length) return false;
    const hit = keys.find((k) => textHasWord(text, k));
    if (!hit || recent(lastReply, `f:${chat}:${hit}`, 5000)) return false;
    try { await sock.sendMessage(chat, { text: map[hit] }, { quoted: msg }); } catch {}
    return true;
}

// ── membership hook ────────────────────────────
const asJid = (p) => (typeof p === 'string' ? p : (p?.phoneNumber || p?.id || ''));

export async function onParticipants(sock, update) {
    const chat = update?.id;
    if (!chat || !isGroup(chat)) return;
    const list = (update.participants || []).map(asJid).filter(Boolean);
    if (!list.length) return;

    if (update.action === 'remove' || update.action === 'leave') {
        const st = leftStore();
        const arr = (st.data[chat] ||= []);
        for (const j of list) arr.unshift({ jid: j, at: Date.now(), kicked: update.action === 'remove' });
        arr.length = Math.min(arr.length, 60);
        st.save();
    }

    const cfg = groupCfg().data[chat];
    if (update.action === 'add' && cfg?.antifake?.on && cfg.antifake.codes?.length) {
        const bad = list.filter((j) => {
            const d = digitsOf(j);
            return j.endsWith('@s.whatsapp.net') && cfg.antifake.codes.some((c) => d.startsWith(c));
        });
        if (bad.length && (await isBotAdmin(sock, chat))) {
            try {
                await sock.groupParticipantsUpdate(chat, bad, 'remove');
                await sock.sendMessage(chat, { text: `🛡️ antifake removed ${bad.map(tag).join(' ')} (blocked country code).`, mentions: bad });
            } catch {}
        }
    }
}
