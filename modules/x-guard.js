// ─────────────────────────────────────────────
//  Al-Jin · modules/x-guard.js          (no extra dependency)
//  Commands : muteuser · unmuteuser · mutelist · mutesticker · unmutesticker
//             · antiforward · dnd
//  Hook     : guardMessage()  → called from modules/x-hooks.js on every group message
//  Shared   : enforce()       → punishment ladder used by antiword, antitag, antiforward
//             (delete → warn (N strikes → kick) → kick → tkick <duration>)
//  Admins and bot owners are always exempt. The bot must be admin to delete / remove.
//  State lives in the same debounced "group" store as the other protections
//  (state/x-group.json) plus state/x-guard.json for pending temp-kick returns.
// ─────────────────────────────────────────────
import {
    reply, safe, store, isGroup, groupMeta, findParticipant, isAdminP, isBotAdmin, isSenderAdmin,
    senderIds, contextOf, quotedOf, targetJid, tag, unwrap,
} from '../lib/x.js';
import { isOwner } from '../core/identity.js';
import { getBestUserJidSync } from '../core/jid-resolver.js';
import { getPrefix } from '../core/settings.js';
import {
    ACTIONS, TKICK_DEFAULT, parseDuration, fmtMs, isForwarded, addStrike, describeAction, actionSub, matchMute,
} from '../lib/guard-core.js';

const P = () => getPrefix();
const onOff = (v) => (v ? 'on ✅' : 'off ⭕');
const wantOn = (a) => ['on', 'enable', '1', 'true'].includes(String(a).toLowerCase());
const wantOff = (a) => ['off', 'disable', '0', 'false'].includes(String(a).toLowerCase());
const dg = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

const groupStore = () => store('group', {});
const cfgOf = (chat) => { const s = groupStore(); s.data[chat] ||= {}; return s.data[chat]; };
const saveGroup = () => groupStore().save();
const guardStore = () => { const s = store('guard', { tkicks: [] }); s.data.tkicks ||= []; return s; };

/** All number forms (phone + LID digits) a jid may be known by. */
function digitsFor(jid) {
    const out = new Set([dg(jid)]);
    try { out.add(dg(getBestUserJidSync(jid))); } catch { /* ignore */ }
    out.delete('');
    return [...out];
}

// ── temp-kick returns ──────────────────────────
let ticker = null;
let sockRef = null;

export function ensureTicker(sock) {
    sockRef = sock;
    if (ticker) return;
    ticker = setInterval(() => { tickReturns().catch(() => {}); }, 30_000);
    ticker.unref?.();
}

async function tickReturns() {
    if (!sockRef) return;
    const s = guardStore();
    const now = Date.now();
    const due = s.data.tkicks.filter((t) => t.until <= now);
    if (!due.length) return;
    s.data.tkicks = s.data.tkicks.filter((t) => t.until > now);
    s.save();
    for (const t of due) {
        try {
            const res = await sockRef.groupParticipantsUpdate(t.chat, [t.jid], 'add');
            const status = String(res?.[0]?.status ?? '200');
            if (status !== '200') throw new Error(status);
            await sockRef.sendMessage(t.chat, { text: `⏰ ${tag(t.jid)}'s timeout is over — welcome back.`, mentions: [t.jid] });
        } catch {
            try { await sockRef.sendMessage(t.chat, { text: `⏰ ${tag(t.jid)}'s timeout is over, but I couldn't add them back (privacy settings). They can rejoin with the group link.`, mentions: [t.jid] }); } catch { /* ignore */ }
        }
    }
}

// ── punishment ladder ──────────────────────────
/**
 * Deletes the offending message, then applies node.action.
 * node: { action, limit, strikes, tkickMs } — stored inside the group config.
 * opts.noticeOnDelete: send a one-line notice when the action is plain "delete".
 */
export async function enforce(sock, chat, msg, node, who, reason, opts = {}) {
    ensureTicker(sock);
    const action = ACTIONS.includes(node?.action) ? node.action : 'delete';
    try { await sock.sendMessage(chat, { delete: msg.key }); } catch { /* bot not admin */ }
    const say = async (text) => { try { await sock.sendMessage(chat, { text, mentions: [who] }); } catch { /* ignore */ } };

    if (action === 'delete') {
        if (opts.noticeOnDelete) await say(`🚫 ${tag(who)} ${reason}.`);
        return action;
    }

    if (action === 'warn') {
        const r = addStrike(node, dg(who));
        saveGroup();
        if (!r.reached) { await say(`⚠️ ${tag(who)} ${reason} — ${r.left} strike(s) left before removal.`); return action; }
    }

    if (!(await isBotAdmin(sock, chat))) {
        await say(`⚠️ ${tag(who)} ${reason}, but I need admin rights to remove people.`);
        return action;
    }

    // resolve the participant record so remove / re-add use the right jid form
    let removeJid = who;
    let returnJid = null;
    try {
        const meta = await groupMeta(sock, chat);
        const p = findParticipant(meta, senderIds(msg));
        if (p) {
            removeJid = p.id;
            returnJid = p.phoneNumber || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : null);
        }
    } catch { /* ignore */ }
    if (!returnJid) { try { const b = getBestUserJidSync(who); if (String(b).endsWith('@s.whatsapp.net')) returnJid = b; } catch { /* ignore */ } }

    try { await sock.groupParticipantsUpdate(chat, [removeJid], 'remove'); }
    catch { await say(`⚠️ ${tag(who)} ${reason}, but removing them failed.`); return action; }

    if (action === 'tkick' && returnJid) {
        const ms = node.tkickMs || TKICK_DEFAULT;
        const s = guardStore();
        s.data.tkicks.push({ chat, jid: returnJid, until: Date.now() + ms });
        s.save();
        await say(`⏳ ${tag(who)} removed (${reason}) — can return in ${fmtMs(ms)}.`);
    } else {
        await say(`⛔ ${tag(who)} removed (${reason}).`);
    }
    return action;
}

// ── dnd / mute helpers ─────────────────────────
const dndSeen = new Map();
const throttled = (key, ms) => {
    const now = Date.now();
    if (now - (dndSeen.get(key) || 0) < ms) return true;
    dndSeen.set(key, now);
    if (dndSeen.size > 500) dndSeen.delete(dndSeen.keys().next().value);
    return false;
};

const botTagged = (sock, mentioned) => {
    const mine = [sock.user?.id, sock.user?.lid].filter(Boolean).map(dg);
    return mentioned.some((j) => mine.includes(dg(j)));
};

const DEFAULT_DND = '🔕 Do Not Disturb — please don\'t tag me right now.';

// ── the message hook ───────────────────────────
/** @returns {Promise<boolean>} true when the message was consumed (deleted) and must not reach commands. */
export async function guardMessage(sock, chat, msg, _text) {
    if (!isGroup(chat) || msg.key.fromMe) return false;
    ensureTicker(sock);
    const cfg = groupStore().data[chat];
    if (!cfg) return false;

    const mutedUsers = cfg.mutes && Object.keys(cfg.mutes).length;
    const mutedStickers = cfg.mutedStickers?.length;
    const wantsFwd = cfg.antiforward?.on;
    const wantsDnd = cfg.dnd?.on;
    if (!mutedUsers && !mutedStickers && !wantsFwd && !wantsDnd) return false;

    const m = unwrap(msg.message) || {};
    const ids = senderIds(msg);
    const exempt = async () => isSenderAdmin(sock, chat, msg);
    const kill = async () => { try { await sock.sendMessage(chat, { delete: msg.key }); } catch { /* ignore */ } };

    // 1) muted user
    if (mutedUsers) {
        const hit = matchMute(cfg.mutes, ids.map(dg));
        if (hit?.expired) { delete cfg.mutes[hit.key]; saveGroup(); }
        else if (hit && !(await exempt())) { await kill(); return true; }
    }

    // 2) muted sticker (by file hash)
    if (mutedStickers && m.stickerMessage?.fileSha256) {
        const h = Buffer.from(m.stickerMessage.fileSha256).toString('base64');
        if (cfg.mutedStickers.includes(h) && !(await exempt())) { await kill(); return true; }
    }

    // 3) antiforward
    if (wantsFwd && isForwarded(contextOf(msg)) && !(await exempt())) {
        await enforce(sock, chat, msg, cfg.antiforward, ids[0], 'forwarded messages are not allowed here');
        return true;
    }

    // 4) dnd — someone tagged the bot
    if (wantsDnd) {
        const men = contextOf(msg)?.mentionedJid;
        if (men?.length && botTagged(sock, men) && !(await exempt())) {
            await kill();
            if (!throttled(`dnd:${chat}:${dg(ids[0])}`, 30_000)) {
                try { await sock.sendMessage(chat, { text: `${tag(ids[0])} ${cfg.dnd.msg || DEFAULT_DND}`, mentions: [ids[0]] }); } catch { /* ignore */ }
            }
            return true;
        }
    }
    return false;
}

// ── commands ───────────────────────────────────
async function refuseIfProtected(sock, chat, msg, jid) {
    const ids = digitsFor(jid);
    if (ids.some((d) => d === dg(sock.user?.id) || d === dg(sock.user?.lid))) return 'I won\'t do that to myself.';
    if (isOwner(jid) || ids.some((d) => isOwner(`${d}@s.whatsapp.net`))) return 'That user is a bot owner.';
    try {
        const meta = await groupMeta(sock, chat);
        if (isAdminP(findParticipant(meta, [jid, ...ids.map((d) => `${d}@s.whatsapp.net`), ...ids.map((d) => `${d}@lid`)]))) return 'Group admins can\'t be muted.';
    } catch { /* ignore */ }
    return null;
}

export const muteuser = safe('muteuser', async (sock, chat, msg, args) => {
    const jid = targetJid(msg, args);
    if (!jid) {
        return reply(sock, chat, msg, [
            '🔇 *muteuser* — delete everything a member sends',
            `\`${P()}muteuser @user 2h\` · reply with \`${P()}muteuser 30m\``,
            '_Duration: 30s 10m 2h 1d 1w — leave it out to mute until unmuted._',
            `\`${P()}unmuteuser @user\` · \`${P()}mutelist\``,
        ].join('\n'));
    }
    const durTok = args.find((a) => parseDuration(a));
    const ms = durTok ? parseDuration(durTok) : null;
    const why = await refuseIfProtected(sock, chat, msg, jid);
    if (why) return reply(sock, chat, msg, `⛔ ${why}`);

    const cfg = cfgOf(chat);
    cfg.mutes ||= {};
    const ids = digitsFor(jid);
    for (const [k, r] of Object.entries(cfg.mutes)) if ((r.ids || [k]).some((d) => ids.includes(d))) delete cfg.mutes[k];
    cfg.mutes[ids[0]] = { ids, until: ms ? Date.now() + ms : 0, by: dg(senderIds(msg)[0]), at: Date.now() };
    saveGroup();

    const note = (await isBotAdmin(sock, chat)) ? '' : '\n⚠️ _I\'m not an admin, so I can\'t delete their messages yet._';
    await sock.sendMessage(chat, { text: `🔇 ${tag(jid)} muted ${ms ? `for ${fmtMs(ms)}` : 'until unmuted'}.${note}`, mentions: [jid] }, { quoted: msg });
});

export const unmuteuser = safe('unmuteuser', async (sock, chat, msg, args) => {
    const jid = targetJid(msg, args);
    if (!jid) return reply(sock, chat, msg, `Usage: \`${P()}unmuteuser @user\` (or reply to them)`);
    const cfg = cfgOf(chat);
    const ids = digitsFor(jid);
    let n = 0;
    for (const [k, r] of Object.entries(cfg.mutes || {})) if ((r.ids || [k]).some((d) => ids.includes(d))) { delete cfg.mutes[k]; n++; }
    if (n) saveGroup();
    await sock.sendMessage(chat, { text: n ? `🔊 ${tag(jid)} can talk again.` : `${tag(jid)} wasn't muted.`, mentions: [jid] }, { quoted: msg });
});

export const mutelist = safe('mutelist', async (sock, chat, msg) => {
    const cfg = cfgOf(chat);
    const now = Date.now();
    let changed = false;
    const rows = [];
    for (const [k, r] of Object.entries(cfg.mutes || {})) {
        if (r.until && r.until <= now) { delete cfg.mutes[k]; changed = true; continue; }
        rows.push({ jid: `${(r.ids || [k])[0]}@s.whatsapp.net`, left: r.until ? fmtMs(r.until - now) : 'until unmuted' });
    }
    if (changed) saveGroup();
    const stk = cfg.mutedStickers?.length || 0;
    if (!rows.length && !stk) return reply(sock, chat, msg, '🔊 Nobody is muted here.');
    const lines = ['🔇 *Muted members*', ...(rows.length ? rows.map((r) => `• ${tag(r.jid)} — ${r.left}`) : ['_none_']), '', `🖼️ Banned stickers: ${stk}`];
    await sock.sendMessage(chat, { text: lines.join('\n'), mentions: rows.map((r) => r.jid) }, { quoted: msg });
});

const stickerHash = (msg) => {
    const st = quotedOf(msg)?.message?.stickerMessage;
    return st?.fileSha256 ? Buffer.from(st.fileSha256).toString('base64') : null;
};

export const mutesticker = safe('mutesticker', async (sock, chat, msg, args) => {
    const cfg = cfgOf(chat);
    const sub = (args[0] || '').toLowerCase();
    cfg.mutedStickers ||= [];
    if (sub === 'list') return reply(sock, chat, msg, `🖼️ ${cfg.mutedStickers.length} banned sticker(s) in this group.`);
    if (sub === 'clear') { const n = cfg.mutedStickers.length; cfg.mutedStickers = []; saveGroup(); return reply(sock, chat, msg, `🧹 cleared ${n} banned sticker(s).`); }
    const h = stickerHash(msg);
    if (!h) return reply(sock, chat, msg, [
        '🖼️ *mutesticker* — ban one specific sticker',
        `Reply to the sticker with \`${P()}mutesticker\`.`,
        `\`${P()}unmutesticker\` (reply) · \`${P()}mutesticker list\` · \`${P()}mutesticker clear\``,
        '_Exact sticker only; admins are exempt; I must be admin to delete._',
    ].join('\n'));
    if (cfg.mutedStickers.includes(h)) return reply(sock, chat, msg, 'That sticker is already banned.');
    if (cfg.mutedStickers.length >= 100) return reply(sock, chat, msg, 'Limit reached (100). Use `mutesticker clear` first.');
    cfg.mutedStickers.push(h);
    saveGroup();
    return reply(sock, chat, msg, `🚫 sticker banned (${cfg.mutedStickers.length} total).`);
});

export const unmutesticker = safe('unmutesticker', async (sock, chat, msg) => {
    const cfg = cfgOf(chat);
    const h = stickerHash(msg);
    if (!h) return reply(sock, chat, msg, `Reply to the banned sticker with \`${P()}unmutesticker\`.`);
    const before = (cfg.mutedStickers ||= []).length;
    cfg.mutedStickers = cfg.mutedStickers.filter((x) => x !== h);
    if (cfg.mutedStickers.length !== before) saveGroup();
    return reply(sock, chat, msg, cfg.mutedStickers.length !== before ? '✅ sticker allowed again.' : 'That sticker wasn\'t banned.');
});

export const antiforward = safe('antiforward', async (sock, chat, msg, args) => {
    const a = (cfgOf(chat).antiforward ||= { on: false, action: 'delete', limit: 3, v2: true });
    const sub = (args[0] || '').toLowerCase();
    if (wantOn(sub)) { a.on = true; saveGroup(); return reply(sock, chat, msg, `⏩ *antiforward* on — action: ${describeAction(a)}.`); }
    if (wantOff(sub)) { a.on = false; saveGroup(); return reply(sock, chat, msg, '⏩ *antiforward* off.'); }
    const r = actionSub(sub, args, a, `${P()}antiforward`);
    if (r) { if (r.ok) saveGroup(); return reply(sock, chat, msg, r.err || r.ok); }
    return reply(sock, chat, msg, [
        `⏩ *antiforward* · ${onOff(a.on)} · ${describeAction(a)}`, '',
        `\`${P()}antiforward on|off\``,
        `\`${P()}antiforward action delete|warn|kick|tkick [30m]\``,
        `\`${P()}antiforward limit <1-10>\` _(strikes for warn)_`,
        '_Non-admins only. The bot must be admin._',
    ].join('\n'));
});

export const dnd = safe('dnd', async (sock, chat, msg, args) => {
    const a = (cfgOf(chat).dnd ||= { on: false, msg: '' });
    const sub = (args[0] || '').toLowerCase();
    if (wantOff(sub)) { a.on = false; saveGroup(); return reply(sock, chat, msg, '🔕 *dnd* off.'); }
    if (wantOn(sub) && args.length === 1) { a.on = true; saveGroup(); return reply(sock, chat, msg, `🔕 *dnd* on — tags of the bot are deleted.\n_Reply:_ ${a.msg || DEFAULT_DND}`); }
    if (args.length) {
        a.msg = args.join(' ').slice(0, 300);
        a.on = true;
        saveGroup();
        return reply(sock, chat, msg, `🔕 *dnd* on with your message:\n${a.msg}`);
    }
    return reply(sock, chat, msg, [
        `🔕 *dnd* · ${onOff(a.on)}`, `reply: ${a.msg || DEFAULT_DND}`, '',
        `\`${P()}dnd on|off\``, `\`${P()}dnd <your message>\` _(turns it on with that reply)_`,
        '_Deletes messages from non-admins that tag the bot. Admins and owners can still tag it._',
    ].join('\n'));
});
