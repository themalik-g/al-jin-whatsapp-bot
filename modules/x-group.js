// ─────────────────────────────────────────────
//  Al-Jin · modules/x-group.js
//  antiword · antitag · antigm · antifake · areact · filter/gfilter/stop/gstop
//  setgname · admins · link · inactive · common · left · msgs
//  afk · poll · vote
//  Permissions (group / admin / owner) are enforced by modules/x-registry.js.
// ─────────────────────────────────────────────
import {
    reply, safe, groupMeta, isAdminP, isBotAdmin, tag, pJid, duration, argOrQuoted, targetJid, senderIds, findParticipant,
} from '../lib/x.js';
import { cfgOf, groupCfg, globalCfg, statsStore, leftStore, userKey } from './x-hooks.js';
import { getPrefix } from '../core/settings.js';
import { migrateAction, actionSub, describeAction } from '../lib/guard-core.js';

const P = () => getPrefix();
const onOff = (v) => (v ? 'on ✅' : 'off ⭕');
const wantOn = (a) => ['on', 'enable', '1', 'true'].includes(String(a).toLowerCase());
const wantOff = (a) => ['off', 'disable', '0', 'false'].includes(String(a).toLowerCase());

// ── antiword (alias antibadword) ───────────────
export const antiword = safe('antiword', async (sock, chat, msg, args) => {
    const c = cfgOf(chat);
    const a = migrateAction(c.antiword ||= { on: false, words: [], action: 'delete', limit: 3, v2: true });
    const sub = (args[0] || '').toLowerCase();
    const save = () => groupCfg().save();
    if (wantOn(sub)) { a.on = true; save(); return reply(sock, chat, msg, `🧼 *antiword* on — ${a.words.length} word(s), action: ${describeAction(a)}.`); }
    if (wantOff(sub)) { a.on = false; save(); return reply(sock, chat, msg, '🧼 *antiword* off.'); }
    if (sub === 'add') {
        const words = args.slice(1).map((w) => w.toLowerCase()).filter((w) => w.length > 1);
        if (!words.length) return reply(sock, chat, msg, `Usage: \`${P()}antiword add word1 word2\``);
        a.words = [...new Set([...a.words, ...words])].slice(0, 200); save();
        return reply(sock, chat, msg, `➕ added ${words.length}. Total: ${a.words.length}.`);
    }
    if (sub === 'del' || sub === 'remove') {
        const before = a.words.length;
        a.words = a.words.filter((w) => !args.slice(1).map((x) => x.toLowerCase()).includes(w)); save();
        return reply(sock, chat, msg, `➖ removed ${before - a.words.length}.`);
    }
    if (sub === 'list') return reply(sock, chat, msg, a.words.length ? `🧼 *banned words*\n\n${a.words.join(', ')}` : 'No banned words yet.');
    if (sub === 'action') {
        const r = actionSub(sub, args, a, `${P()}antiword`);
        if (r.ok) save();
        return reply(sock, chat, msg, r.err || r.ok);
    }
    if (sub === 'limit') {
        const n = parseInt(args[1], 10);
        if (!(n >= 1 && n <= 10)) return reply(sock, chat, msg, `Usage: \`${P()}antiword limit 1-10\``);
        a.limit = n; save(); return reply(sock, chat, msg, `⚙️ strike limit: *${n}*.`);
    }
    return reply(sock, chat, msg, [
        `🧼 *antiword* · ${onOff(a.on)}`, `words: ${a.words.length} · action: ${describeAction(a)} · limit: ${a.limit}`, '',
        `\`${P()}antiword on|off\``, `\`${P()}antiword add <words…>\` / \`del\` / \`list\``, `\`${P()}antiword action delete|warn|kick|tkick [30m]\``, `\`${P()}antiword limit <n>\``,
    ].join('\n'));
});

// ── antitag ────────────────────────────────────
export const antitag = safe('antitag', async (sock, chat, msg, args) => {
    const a = migrateAction(cfgOf(chat).antitag ||= { on: false, max: 5, action: 'delete', limit: 3, v2: true });
    const sub = (args[0] || '').toLowerCase();
    if (wantOn(sub)) { a.on = true; groupCfg().save(); return reply(sock, chat, msg, `🏷️ *antitag* on — messages with more than ${a.max} mentions are deleted.`); }
    if (wantOff(sub)) { a.on = false; groupCfg().save(); return reply(sock, chat, msg, '🏷️ *antitag* off.'); }
    if (sub === 'max') {
        const n = parseInt(args[1], 10);
        if (!(n >= 1 && n <= 50)) return reply(sock, chat, msg, `Usage: \`${P()}antitag max 1-50\``);
        a.max = n; groupCfg().save(); return reply(sock, chat, msg, `🏷️ limit set to *${n}* mentions.`);
    }
    {
        const r = actionSub(sub, args, a, `${P()}antitag`);
        if (r) { if (r.ok) groupCfg().save(); return reply(sock, chat, msg, r.err || r.ok); }
    }
    return reply(sock, chat, msg, `🏷️ *antitag* · ${onOff(a.on)} · max ${a.max} · ${describeAction(a)}\n\n\`${P()}antitag on|off\`\n\`${P()}antitag max <n>\`\n\`${P()}antitag action delete|warn|kick|tkick [30m]\`\n\`${P()}antitag limit <1-10>\`\n_Non-admins only. The bot must be admin to delete._`);
});

// ── antigm ─────────────────────────────────────
export const antigm = safe('antigm', async (sock, chat, msg, args) => {
    const a = (cfgOf(chat).antigm ||= { on: false });
    const sub = (args[0] || '').toLowerCase();
    if (wantOn(sub)) { a.on = true; groupCfg().save(); return reply(sock, chat, msg, '🚫 *antigm* on — group-status mentions are deleted.'); }
    if (wantOff(sub)) { a.on = false; groupCfg().save(); return reply(sock, chat, msg, '🚫 *antigm* off.'); }
    return reply(sock, chat, msg, `🚫 *antigm* · ${onOff(a.on)}\n\nBlocks "group mentioned in a status" spam from non-admins.\n\`${P()}antigm on|off\``);
});

// ── antifake ───────────────────────────────────
export const antifake = safe('antifake', async (sock, chat, msg, args) => {
    const a = (cfgOf(chat).antifake ||= { on: false, codes: [] });
    const sub = (args[0] || '').toLowerCase();
    const save = () => groupCfg().save();
    const codes = () => args.slice(1).map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 1 && x.length <= 4);
    if (wantOn(sub)) { a.on = true; save(); return reply(sock, chat, msg, `🛡️ *antifake* on — blocked codes: ${a.codes.join(', ') || 'none yet'}.`); }
    if (wantOff(sub)) { a.on = false; save(); return reply(sock, chat, msg, '🛡️ *antifake* off.'); }
    if (sub === 'add') {
        const c = codes(); if (!c.length) return reply(sock, chat, msg, `Usage: \`${P()}antifake add 1 212 91\``);
        a.codes = [...new Set([...a.codes, ...c])]; save(); return reply(sock, chat, msg, `➕ blocked codes: ${a.codes.join(', ')}`);
    }
    if (sub === 'del') { const c = codes(); a.codes = a.codes.filter((x) => !c.includes(x)); save(); return reply(sock, chat, msg, `➖ blocked codes: ${a.codes.join(', ') || 'none'}`); }
    if (sub === 'list') return reply(sock, chat, msg, `🛡️ blocked country codes: ${a.codes.join(', ') || 'none'}`);
    return reply(sock, chat, msg, `🛡️ *antifake* · ${onOff(a.on)} · codes: ${a.codes.join(', ') || 'none'}\n\nRemoves new members whose number starts with a blocked country code.\n\`${P()}antifake on|off\`\n\`${P()}antifake add|del <codes…>\` · \`list\``);
});

// ── areact ─────────────────────────────────────
export const areact = safe('areact', async (sock, chat, msg, args) => {
    const a = (cfgOf(chat).areact ||= { on: false, emoji: [] });
    const sub = (args[0] || '').toLowerCase();
    if (wantOn(sub)) { a.on = true; groupCfg().save(); return reply(sock, chat, msg, '😀 *areact* on.'); }
    if (wantOff(sub)) { a.on = false; groupCfg().save(); return reply(sock, chat, msg, '😀 *areact* off.'); }
    if (sub === 'emoji') {
        const list = args.slice(1).filter((e) => e.length <= 8).slice(0, 8);
        a.emoji = list; groupCfg().save();
        return reply(sock, chat, msg, list.length ? `😀 emoji set: ${list.join(' ')}` : '😀 emoji list cleared (default random set).');
    }
    return reply(sock, chat, msg, `😀 *areact* · ${onOff(a.on)} · ${a.emoji.join(' ') || 'default set'}\n\n\`${P()}areact on|off\`\n\`${P()}areact emoji 🔥 😂 ❤️\``);
});

// ── filters ────────────────────────────────────
function splitFilter(args) {
    const raw = args.join(' ');
    if (raw.includes('|')) { const [t, ...r] = raw.split('|'); return [t.trim().toLowerCase(), r.join('|').trim()]; }
    return [(args[0] || '').toLowerCase(), args.slice(1).join(' ').trim()];
}

function filterHandler(scopeName, getMap, save) {
    return safe(scopeName, async (sock, chat, msg, args) => {
        const map = getMap(chat);
        const sub = (args[0] || '').toLowerCase();
        if (!args.length || sub === 'list') {
            const keys = Object.keys(map);
            return reply(sock, chat, msg, keys.length
                ? `🔁 *${scopeName}s* (${keys.length})\n\n${keys.map((k) => `• ${k}`).join('\n')}\n\n_Add:_ \`${P()}${scopeName} word | reply\``
                : `No ${scopeName}s yet.\nAdd one: \`${P()}${scopeName} hello | Hi there!\``);
        }
        const [trig, resp] = splitFilter(args);
        if (!trig || !resp) return reply(sock, chat, msg, `Usage: \`${P()}${scopeName} trigger | reply text\``);
        if (Object.keys(map).length >= 100 && !map[trig]) return reply(sock, chat, msg, 'Limit reached (100).');
        map[trig] = resp.slice(0, 1500); save();
        return reply(sock, chat, msg, `✅ ${scopeName} saved for “${trig}”.`);
    });
}
export const filter = filterHandler('filter', (chat) => (cfgOf(chat).filters ||= {}), () => groupCfg().save());
export const gfilter = filterHandler('gfilter', () => globalCfg().data.gfilters, () => globalCfg().save());

function stopHandler(name, getMap, save) {
    return safe(name, async (sock, chat, msg, args) => {
        const t = args.join(' ').trim().toLowerCase();
        if (!t) return reply(sock, chat, msg, `Usage: \`${P()}${name} <trigger>\``);
        const map = getMap(chat);
        if (!map[t]) return reply(sock, chat, msg, 'No such trigger.');
        delete map[t]; save();
        return reply(sock, chat, msg, `🗑️ removed “${t}”.`);
    });
}
export const stop = stopHandler('stop', (chat) => (cfgOf(chat).filters ||= {}), () => groupCfg().save());
export const gstop = stopHandler('gstop', () => globalCfg().data.gfilters, () => globalCfg().save());

// ── simple group actions ───────────────────────
export const setgname = safe('setgname', async (sock, chat, msg, args) => {
    const name = args.join(' ').trim();
    if (!name) return reply(sock, chat, msg, `Usage: \`${P()}setgname <new name>\``);
    if (name.length > 100) return reply(sock, chat, msg, 'Group names are limited to 100 characters.');
    if (!(await isBotAdmin(sock, chat))) return reply(sock, chat, msg, '❌ I need to be a group admin for that.');
    await sock.groupUpdateSubject(chat, name);
    return reply(sock, chat, msg, `✅ group renamed to *${name}*.`);
});

export const admins = safe('admins', async (sock, chat, msg, args) => {
    const meta = await groupMeta(sock, chat);
    const list = (meta.participants || []).filter(isAdminP);
    const note = args.join(' ').trim();
    const text = `👑 *admins* (${list.length})${note ? `\n_${note}_` : ''}\n\n${list.map((p, i) => `${i + 1}. ${tag(pJid(p))}${p.admin === 'superadmin' ? ' ⭐' : ''}`).join('\n')}`;
    return reply(sock, chat, msg, text, { mentions: list.map(pJid) });
});

export const link = safe('link', async (sock, chat, msg) => {
    if (!(await isBotAdmin(sock, chat))) return reply(sock, chat, msg, '❌ I need to be a group admin to read the invite link.');
    const meta = await groupMeta(sock, chat);
    const code = await sock.groupInviteCode(chat);
    return reply(sock, chat, msg, `🔗 *${meta.subject}*\nhttps://chat.whatsapp.com/${code}`);
});

// ── analytics: inactive / msgs / left / common ─
export const inactive = safe('inactive', async (sock, chat, msg, args) => {
    const days = Math.min(Math.max(parseInt(args[0], 10) || 7, 1), 365);
    const meta = await groupMeta(sock, chat);
    const rows = statsStore().data[chat] || {};
    const cutoff = Date.now() - days * 86400000;
    const quiet = (meta.participants || []).filter((p) => {
        if (isAdminP(p)) return false;
        const keys = [p.id, p.lid, p.phoneNumber].filter(Boolean).map((j) => String(j).split('@')[0].split(':')[0].replace(/\D/g, ''));
        const last = Math.max(0, ...keys.map((k) => rows[k]?.last || 0));
        return last < cutoff;
    });
    if (!quiet.length) return reply(sock, chat, msg, `✅ everyone spoke in the last ${days} day(s).`);
    const shown = quiet.slice(0, 60);
    return reply(sock, chat, msg,
        `😴 *inactive ${days}d* — ${quiet.length} member(s)\n_(counting starts from when the bot joined)_\n\n${shown.map((p) => `• ${tag(pJid(p))}`).join('\n')}${quiet.length > shown.length ? `\n…and ${quiet.length - shown.length} more` : ''}`,
        { mentions: shown.map(pJid) });
});

export const msgs = safe('msgs', async (sock, chat, msg, args) => {
    if (!chat.endsWith('@g.us')) return reply(sock, chat, msg, 'Group only.');
    const rows = statsStore().data[chat] || {};
    if ((args[0] || '').toLowerCase() === 'top') {
        const top = Object.entries(rows).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
        if (!top.length) return reply(sock, chat, msg, 'No messages counted yet.');
        return reply(sock, chat, msg, `🏆 *top chatters*\n\n${top.map(([k, v], i) => `${i + 1}. @${k} — ${v.n}`).join('\n')}`,
            { mentions: top.map(([k]) => `${k}@s.whatsapp.net`) });
    }
    const t = targetJid(msg, args);
    const key = t ? String(t).split('@')[0] : userKey(msg);
    const row = rows[key];
    return reply(sock, chat, msg, row
        ? `💬 @${key}: *${row.n}* message(s) · last seen ${duration(Date.now() - row.last)} ago`
        : `💬 @${key}: no messages counted yet.`, { mentions: [`${key}@s.whatsapp.net`] });
});

export const left = safe('left', async (sock, chat, msg, args) => {
    const n = Math.min(Math.max(parseInt(args[0], 10) || 10, 1), 40);
    const arr = (leftStore().data[chat] || []).slice(0, n);
    if (!arr.length) return reply(sock, chat, msg, 'Nobody has left since the bot started tracking.');
    return reply(sock, chat, msg, `🚪 *recently left*\n\n${arr.map((r) => `• ${tag(r.jid)} — ${duration(Date.now() - r.at)} ago${r.kicked ? ' (removed)' : ''}`).join('\n')}`,
        { mentions: arr.map((r) => r.jid) });
});

export const common = safe('common', async (sock, chat, msg, args) => {
    const all = Object.values(await sock.groupFetchAllParticipating()).filter((g) => g.id !== chat);
    all.sort((a, b) => String(a.subject).localeCompare(String(b.subject)));
    const idx = parseInt(args[0], 10);
    if (!idx) {
        if (!all.length) return reply(sock, chat, msg, 'The bot is in no other group.');
        return reply(sock, chat, msg, `👥 *pick a group*\n\n${all.slice(0, 40).map((g, i) => `${i + 1}. ${g.subject}`).join('\n')}\n\n\`${P()}common <number>\``);
    }
    const other = all[idx - 1];
    if (!other) return reply(sock, chat, msg, 'Invalid number.');
    const here = await groupMeta(sock, chat);
    const ids = (p) => [p.id, p.lid, p.phoneNumber].filter(Boolean).map((j) => String(j).split('@')[0].split(':')[0]);
    const theirs = new Set(other.participants.flatMap(ids));
    const shared = here.participants.filter((p) => ids(p).some((i) => theirs.has(i)));
    if (!shared.length) return reply(sock, chat, msg, `No members in common with *${other.subject}*.`);
    return reply(sock, chat, msg, `👥 *in common with ${other.subject}* (${shared.length})\n\n${shared.slice(0, 80).map((p) => `• ${tag(pJid(p))}`).join('\n')}`,
        { mentions: shared.slice(0, 80).map(pJid) });
});

// ── afk ────────────────────────────────────────
export const afk = safe('afk', async (sock, chat, msg, args) => {
    const g = globalCfg();
    const reason = args.join(' ').trim().slice(0, 120);
    const ids = senderIds(msg).map((j) => String(j).split('@')[0].replace(/\D/g, ''));
    for (const d of ids) g.data.afk[d] = { since: Date.now(), reason };
    g.save();
    return reply(sock, chat, msg, `💤 you are now afk${reason ? `: _${reason}_` : ''}. I'll tell people who tag you.`);
});

// ── poll & vote ────────────────────────────────
export const poll = safe('poll', async (sock, chat, msg, args) => {
    const raw = argOrQuoted(msg, args);
    const multi = /--multi\b/.test(raw);
    const parts = raw.replace(/--multi\b/, '').split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return reply(sock, chat, msg, `Usage: \`${P()}poll Question | Option 1 | Option 2 [| …] [--multi]\``);
    const [name, ...values] = parts;
    const opts = [...new Set(values)].slice(0, 12);
    if (opts.length < 2) return reply(sock, chat, msg, 'Give at least two different options.');
    await sock.sendMessage(chat, { poll: { name: name.slice(0, 200), values: opts.map((o) => o.slice(0, 90)), selectableCount: multi ? 0 : 1 } });
});

const votes = new Map(); // chat → { q, by, yes:Set, no:Set }
export const vote = safe('vote', async (sock, chat, msg, args) => {
    const sub = (args[0] || '').toLowerCase();
    const v = votes.get(chat);
    const who = userKey(msg);
    const tally = (x) => `✅ yes: *${x.yes.size}*   ❌ no: *${x.no.size}*`;
    if (['yes', 'y', 'no', 'n'].includes(sub)) {
        if (!v) return reply(sock, chat, msg, `No active vote. Start one with \`${P()}vote <question>\`.`);
        v.yes.delete(who); v.no.delete(who);
        (sub.startsWith('y') ? v.yes : v.no).add(who);
        return reply(sock, chat, msg, `🗳️ counted.\n${tally(v)}`);
    }
    if (sub === 'end' || sub === 'result') {
        if (!v) return reply(sock, chat, msg, 'No active vote.');
        if (sub === 'end') votes.delete(chat);
        const total = v.yes.size + v.no.size;
        const verdict = v.yes.size === v.no.size ? 'tie' : v.yes.size > v.no.size ? 'passed ✅' : 'rejected ❌';
        return reply(sock, chat, msg, `🗳️ *${v.q}*\n${tally(v)}  (${total} vote${total === 1 ? '' : 's'})\n\nResult: *${verdict}*${sub === 'end' ? '' : '\n_still open_'}`);
    }
    const q = args.join(' ').trim();
    if (!q) {
        return reply(sock, chat, msg, v ? `🗳️ *${v.q}*\n${tally(v)}\n\n\`${P()}vote yes|no\` · \`${P()}vote end\`` : `Usage: \`${P()}vote <question>\` then \`${P()}vote yes|no\``);
    }
    votes.set(chat, { q: q.slice(0, 200), yes: new Set(), no: new Set() });
    if (votes.size > 100) votes.delete(votes.keys().next().value);
    return reply(sock, chat, msg, `🗳️ *vote started*\n${q}\n\nAnswer with \`${P()}vote yes\` or \`${P()}vote no\`\nFinish with \`${P()}vote end\``);
});

// silence unused-import lint for helpers kept for future use
void findParticipant;
