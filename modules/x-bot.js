// ─────────────────────────────────────────────
//  Al-Jin · modules/x-bot.js
//  Owner-side controls:  ban · unban · banlist · pmblocker · setcmd · delcmd · cmds
//  cleartmp · clearsession · save · del · shutdown · ison
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reply, safe, targetJid, quotedOf, contextOf, findMedia, mediaBuffer, textOfMessage, isGroup, isSenderAdmin, isBotAdmin, bytesToSize, isOwnerMsg } from '../lib/x.js';
import { globalCfg } from './x-hooks.js';
import { hasExtra } from './x-registry.js';
import { isOwner, ownerJid } from '../core/identity.js';
import { sessionPath } from '../core/paths.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();
const dig = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// ── ban / unban / banlist ──────────────────────
export const ban = safe('ban', async (sock, chat, msg, args) => {
    const t = targetJid(msg, args);
    if (!t) return reply(sock, chat, msg, `Usage: \`${P()}ban @user\` (or reply / number)`);
    if (isOwner(t)) return reply(sock, chat, msg, '❌ You cannot ban an owner.');
    const g = globalCfg();
    const d = dig(t);
    if (!g.data.banned.includes(d)) g.data.banned.push(d);
    g.save();
    return reply(sock, chat, msg, `🔨 @${d} can no longer use bot commands.`, { mentions: [t] });
});

export const unban = safe('unban', async (sock, chat, msg, args) => {
    const t = targetJid(msg, args);
    if (!t) return reply(sock, chat, msg, `Usage: \`${P()}unban @user\``);
    const g = globalCfg();
    const d = dig(t);
    const had = g.data.banned.includes(d);
    g.data.banned = g.data.banned.filter((x) => x !== d);
    g.save();
    return reply(sock, chat, msg, had ? `✅ @${d} is unbanned.` : `@${d} was not banned.`, { mentions: [t] });
});

export const banlist = safe('banlist', async (sock, chat, msg) => {
    const list = globalCfg().data.banned;
    return reply(sock, chat, msg, list.length ? `🔨 *banned from commands* (${list.length})\n\n${list.map((d) => `• +${d}`).join('\n')}` : 'Nobody is banned.');
});

// ── pmblocker ──────────────────────────────────
export const pmblocker = safe('pmblocker', async (sock, chat, msg, args) => {
    const g = globalCfg();
    const pm = g.data.pm;
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'off') { pm.mode = 'off'; g.save(); return reply(sock, chat, msg, '🔓 pmblocker off.'); }
    if (sub === 'warn') { pm.mode = 'warn'; g.save(); return reply(sock, chat, msg, '⚠️ pmblocker: *warn* — strangers get a notice, nobody is blocked.'); }
    if (sub === 'block') {
        if ((args[1] || '').toLowerCase() !== 'confirm') {
            return reply(sock, chat, msg, `⚠️ *block* mode WhatsApp-blocks every non-owner who messages this number — including friends, if this is your personal account.\n\nAllow people first with \`${P()}pmblocker allow @user\`, then run \`${P()}pmblocker block confirm\`.`);
        }
        pm.mode = 'block'; g.save(); return reply(sock, chat, msg, '🔒 pmblocker: *block* is active.');
    }
    if (sub === 'allow' || sub === 'disallow') {
        const t = targetJid(msg, args.slice(1));
        if (!t) return reply(sock, chat, msg, `Usage: \`${P()}pmblocker ${sub} @user\` (or number / reply)`);
        const d = dig(t);
        pm.allow = sub === 'allow' ? [...new Set([...pm.allow, d])] : pm.allow.filter((x) => x !== d);
        g.save();
        return reply(sock, chat, msg, `${sub === 'allow' ? '✅ allowed' : '➖ removed'} +${d}.`);
    }
    if (sub === 'msg') {
        const text = args.slice(1).join(' ').trim();
        if (!text) return reply(sock, chat, msg, `Usage: \`${P()}pmblocker msg <notice text>\``);
        pm.notice = text.slice(0, 400); g.save(); return reply(sock, chat, msg, '✅ notice updated.');
    }
    return reply(sock, chat, msg, [
        `🔒 *pmblocker* · mode: *${pm.mode}* · allowed: ${pm.allow.length}`, '',
        `\`${P()}pmblocker warn\` — notice only`, `\`${P()}pmblocker block confirm\` — notice + block`, `\`${P()}pmblocker off\``,
        `\`${P()}pmblocker allow|disallow @user\``, `\`${P()}pmblocker msg <text>\``,
    ].join('\n'));
});

// ── custom command aliases ─────────────────────
export const setcmd = safe('setcmd', async (sock, chat, msg, args) => {
    const [alias, ...target] = args;
    if (!alias || !target.length) return reply(sock, chat, msg, `Usage: \`${P()}setcmd <alias> <command [args]>\`\nExample: \`${P()}setcmd song play\``);
    const a = alias.toLowerCase().replace(/^[^\w]+/, '');
    if (!/^[a-z0-9_]{1,20}$/.test(a)) return reply(sock, chat, msg, 'Alias must be 1-20 letters, numbers or _.');
    const dest = target.join(' ').replace(new RegExp(`^\\${P()}`), '');
    if (dest.split(/\s+/)[0].toLowerCase() === a) return reply(sock, chat, msg, 'An alias cannot point to itself.');
    const g = globalCfg();
    if (hasExtra(a) && !g.data.aliases[a]) return reply(sock, chat, msg, `❌ *${a}* is already a built-in command.`);
    g.data.aliases[a] = dest; g.save();
    return reply(sock, chat, msg, `✅ \`${P()}${a}\` → \`${P()}${dest}\``);
});

export const delcmd = safe('delcmd', async (sock, chat, msg, args) => {
    const a = (args[0] || '').toLowerCase();
    const g = globalCfg();
    if (!a || !g.data.aliases[a]) return reply(sock, chat, msg, `Usage: \`${P()}delcmd <alias>\` — see \`${P()}cmds\``);
    delete g.data.aliases[a]; g.save();
    return reply(sock, chat, msg, `🗑️ alias *${a}* removed.`);
});

export const cmds = safe('cmds', async (sock, chat, msg) => {
    const al = Object.entries(globalCfg().data.aliases);
    return reply(sock, chat, msg, al.length ? `🔗 *aliases*\n\n${al.map(([k, v]) => `${P()}${k} → ${P()}${v}`).join('\n')}` : `No aliases yet. Add one: \`${P()}setcmd song play\``);
});

// ── maintenance ────────────────────────────────
function sweep(dir, test, olderMs, apply) {
    let n = 0, bytes = 0;
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return { n, bytes }; }
    for (const f of names) {
        if (!test(f)) continue;
        const p = path.join(dir, f);
        try {
            const st = fs.statSync(p);
            if (!st.isFile() || Date.now() - st.mtimeMs < olderMs) continue;
            n++; bytes += st.size;
            if (apply) fs.unlinkSync(p);
        } catch {}
    }
    return { n, bytes };
}

export const cleartmp = safe('cleartmp', async (sock, chat, msg) => {
    const a = sweep(os.tmpdir(), (f) => f.startsWith('aljin_'), 10 * 60 * 1000, true);
    const b = sweep(path.join(process.cwd(), 'vault', 'tmp'), () => true, 10 * 60 * 1000, true);
    return reply(sock, chat, msg, `🧹 removed ${a.n + b.n} temp file(s) · freed ${bytesToSize(a.bytes + b.bytes)}.`);
});

export const clearsession = safe('clearsession', async (sock, chat, msg, args) => {
    const apply = (args[0] || '').toLowerCase() === 'confirm';
    const dir = sessionPath();
    // Only stale, re-creatable Signal files. creds.json, pre-keys and app-state keys are never touched.
    const r = sweep(dir, (f) => /^(sender-key|session)-/.test(f), 3 * 86400 * 1000, apply);
    if (!apply) {
        return reply(sock, chat, msg, `🧹 *dry run* — ${r.n} stale session file(s) (${bytesToSize(r.bytes)}) can be removed.\nThey are rebuilt automatically.\nRun \`${P()}clearsession confirm\` to delete them.`);
    }
    return reply(sock, chat, msg, `🧹 removed ${r.n} stale session file(s) · freed ${bytesToSize(r.bytes)}. creds.json untouched.`);
});

export const shutdown = safe('shutdown', async (sock, chat, msg, args) => {
    if ((args[0] || '').toLowerCase() !== 'confirm') {
        return reply(sock, chat, msg, `⏻ This stops the bot process. If it runs under PM2/Docker with auto-restart it will come back by itself.\nRun \`${P()}shutdown confirm\` to proceed.`);
    }
    await reply(sock, chat, msg, '⏻ shutting down…');
    setTimeout(() => process.exit(0), 800);
});

// ── save / del / ison ──────────────────────────
export const save = safe('save', async (sock, chat, msg) => {
    const q = quotedOf(msg);
    if (!q) return reply(sock, chat, msg, `Reply to a message, photo, video or status with \`${P()}save\`.`);
    const me = ownerJid();
    const media = findMedia({ ...msg, message: { extendedTextMessage: { contextInfo: contextOf(msg) } } });
    if (media && media.kind !== 'sticker') {
        const buf = await mediaBuffer(media, 60 * 1024 * 1024);
        const cap = media.node.caption || '';
        const payload = media.kind === 'image' ? { image: buf, caption: cap }
            : media.kind === 'video' ? { video: buf, caption: cap, gifPlayback: !!media.node.gifPlayback }
                : media.kind === 'audio' ? { audio: buf, mimetype: media.mime || 'audio/mpeg', ptt: !!media.node.ptt }
                    : { document: buf, mimetype: media.mime, fileName: media.node.fileName || 'file' };
        await sock.sendMessage(me, payload);
    } else if (media?.kind === 'sticker') {
        await sock.sendMessage(me, { sticker: await mediaBuffer(media) });
    } else {
        const t = textOfMessage(q.message);
        if (!t) return reply(sock, chat, msg, 'Nothing saveable in that message.');
        await sock.sendMessage(me, { text: t });
    }
    return reply(sock, chat, msg, '💾 saved to your chat.');
});

export const del = safe('del', async (sock, chat, msg) => {
    const ctx = contextOf(msg);
    if (!ctx?.stanzaId) return reply(sock, chat, msg, `Reply to the message you want deleted with \`${P()}del\`.`);
    const owner = isOwnerMsg(msg);
    const mine = ctx.participant ? [sock.user?.id, sock.user?.lid].filter(Boolean).some((j) => dig(j) === dig(ctx.participant)) : false;
    if (isGroup(chat)) {
        if (!owner && !(await isSenderAdmin(sock, chat, msg))) return reply(sock, chat, msg, '⛔ Group admins only.');
        if (!mine && !(await isBotAdmin(sock, chat))) return reply(sock, chat, msg, '❌ I need to be admin to delete other people’s messages.');
    } else if (!owner) {
        return reply(sock, chat, msg, '⛔ Owner only.');
    }
    await sock.sendMessage(chat, { delete: { remoteJid: chat, id: ctx.stanzaId, fromMe: mine, participant: isGroup(chat) ? ctx.participant : undefined } });
    try { await sock.sendMessage(chat, { delete: msg.key }); } catch {}
});

export const ison = safe('ison', async (sock, chat, msg, args) => {
    const nums = [...new Set(args.map((a) => a.replace(/\D/g, '')).filter((d) => d.length >= 7 && d.length <= 15))].slice(0, 15);
    if (!nums.length) return reply(sock, chat, msg, `Usage: \`${P()}ison 923001234567 [more numbers]\``);
    const res = await sock.onWhatsApp(...nums.map((n) => `${n}@s.whatsapp.net`));
    const found = new Map((res || []).map((r) => [dig(r.jid), r.exists]));
    return reply(sock, chat, msg, `📱 *on WhatsApp?*\n\n${nums.map((n) => `${found.get(n) ? '✅' : '❌'} +${n}`).join('\n')}`);
});
