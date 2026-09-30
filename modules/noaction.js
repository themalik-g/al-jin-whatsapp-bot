// ─────────────────────────────────────────────
// WRAITH · modules/noaction.js
// .noaction — keeps chosen numbers safe inside groups.
//   demoted  → promoted again straight away
//   kicked   → added back and promoted (invite link sent if WhatsApp refuses the add)
//
//   .noaction @user            guard in THIS group
//   .noaction @user all        guard in every group where the bot is admin
//   .noaction off @user        stop guarding
//   .noaction list
//
// Limits (WhatsApp rules, not bugs):
//  • the bot must be admin — it can never restore ITSELF; let a second bot guard it
//  • it ignores: the bot, owners, other guarded numbers, and people who leave on their own
//  • max 3 restores per person per group every 10 min, then it pauses and tells you
// ─────────────────────────────────────────────
import { isOwner } from '../core/identity.js';
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { inState } from '../core/paths.js';
import { getBestUserJid, digitsOf } from '../core/jid-resolver.js';
import { getTarget, ownerOnly, notifyOwner } from '../lib/targets.js';

const DEBUG = process.env.WRAITH_DEBUG === '1';
const FILE = () => inState('noaction.json');
const ACT_DELAY_MS = 1500;
const WINDOW_MS = 10 * 60_000;
const MAX_RESTORES = 3;

let cache = null;
const attempts = new Map();
const paused = new Set();
const attached = new WeakSet();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function guards() { if (!cache) cache = readJson(FILE(), {}); return cache; }
function save() { writeJsonAtomic(FILE(), cache || {}); }
function isGuarded(d, chat) {
    const g = guards()[d];
    return !!g && (g.all === true || (g.groups || []).includes(chat));
}

async function idsOf(sock, chat, p) {
    const jid = typeof p === 'string' ? p : (p?.id || p?.jid || null);
    const pn = typeof p === 'object' ? p?.phoneNumber : null;
    const ids = new Set();
    if (jid) {
        ids.add(digitsOf(jid));
        try { ids.add(digitsOf(await getBestUserJid(jid, sock, chat))); } catch { /* ignore */ }
    }
    if (pn) ids.add(digitsOf(pn));
    ids.delete('');
    return { jid, ids };
}

async function groupName(sock, chat) {
    try { return (await sock.groupMetadata(chat))?.subject || chat; } catch { return chat; }
}

async function restore(sock, chat, action, jid, d, authorLabel) {
    const who = `+${d}`;
    const gname = await groupName(sock, chat);
    try {
        if (action === 'demote') {
            await sock.groupParticipantsUpdate(chat, [jid], 'promote');
            return notifyOwner(sock, `🛡️ *noaction*\n${who} was demoted by ${authorLabel}\ngroup · ${gname}\n→ promoted again ✅`);
        }
        const res = await sock.groupParticipantsUpdate(chat, [jid], 'add');
        const status = String(res?.[0]?.status || '');
        if (status === '200' || status === '409') {
            await sleep(2500);
            await sock.groupParticipantsUpdate(chat, [jid], 'promote').catch(() => {});
            return notifyOwner(sock, `🛡️ *noaction*\n${who} was removed by ${authorLabel}\ngroup · ${gname}\n→ added back and promoted ✅`);
        }
        let sent = false;
        try {
            const code = await sock.groupInviteCode(chat);
            await sock.sendMessage(jid, { text: `You were removed from *${gname}*.\nRejoin: https://chat.whatsapp.com/${code}` });
            sent = true;
        } catch { /* ignore */ }
        return notifyOwner(sock, `🛡️ *noaction*\n${who} was removed by ${authorLabel}\ngroup · ${gname}\n→ WhatsApp refused the add (status ${status || '?'}); invite link ${sent ? 'sent to them privately' : 'could not be sent'}`);
    } catch (e) {
        const notAdmin = /not-authorized|forbidden|403/i.test(e?.message || '');
        return notifyOwner(sock, `⚠️ *noaction* failed for ${who} in *${gname}*: ${notAdmin ? 'the bot is not admin there' : e.message}`);
    }
}

async function onUpdate(sock, u) {
    const chat = u?.id;
    const action = u?.action;
    const members = u?.participants || [];
    if (!chat || !String(chat).endsWith('@g.us') || !members.length) return;
    if (action !== 'demote' && action !== 'remove') return;
    const g = guards();
    if (!Object.keys(g).length) return;

    // who did it?
    const author = new Set();
    if (u.author) {
        author.add(digitsOf(u.author));
        try { author.add(digitsOf(await getBestUserJid(u.author, sock, chat))); } catch { /* ignore */ }
    }
    if (u.authorPn) author.add(digitsOf(u.authorPn));
    author.delete('');

    const me = new Set([digitsOf(sock.user?.id), digitsOf(sock.user?.lid)]);
    for (const a of author) {
        if (me.has(a) || isOwner(a) || g[a]) return; // our own / owner / trusted action
    }
    const authorLabel = author.size ? `+${[...author][0]}` : 'someone';

    for (const m of members) {
        const { jid, ids } = await idsOf(sock, chat, m);
        if (!jid) continue;
        const d = [...ids].find((x) => isGuarded(x, chat));
        if (!d || me.has(d)) continue;
        if (action === 'remove') {
            if (!author.size) { // cannot tell kick from leave → do nothing, just tell the owner
                notifyOwner(sock, `ℹ️ *noaction*: +${d} left or was removed from ${chat} but WhatsApp gave no author, so I did nothing.`);
                continue;
            }
            if (author.has(d)) continue; // they left on their own
        }

        const key = `${chat}|${d}`;
        if (paused.has(key)) continue;
        const now = Date.now();
        const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
        if (recent.length >= MAX_RESTORES) {
            paused.add(key);
            const t = setTimeout(() => paused.delete(key), WINDOW_MS);
            t.unref?.();
            notifyOwner(sock, `⏸️ *noaction* paused for +${d} in ${chat}: ${MAX_RESTORES} restores in 10 min (someone keeps doing it — last by ${authorLabel}). It resumes in 10 min.`);
            continue;
        }
        recent.push(now);
        attempts.set(key, recent);

        await sleep(ACT_DELAY_MS);
        await restore(sock, chat, action, jid, d, authorLabel);
    }
}

export function startNoAction(sock) {
    if (!sock?.ev || attached.has(sock)) return;
    attached.add(sock);
    sock.ev.on('group-participants.update', (u) => {
        onUpdate(sock, u).catch((e) => { if (DEBUG) console.log('[noaction]', e.message); });
    });
}

async function botIsAdmin(sock, chat) {
    try {
        const meta = await sock.groupMetadata(chat);
        const me = [digitsOf(sock.user?.id), digitsOf(sock.user?.lid)];
        return (meta.participants || []).some((p) => p.admin && [p.id, p.phoneNumber, p.jid].filter(Boolean).some((j) => me.includes(digitsOf(j))));
    } catch { return null; }
}

const USAGE =
    '🛡️ *noaction*\n\n' +
    '`.noaction @user` — guard in this group\n' +
    '`.noaction @user all` — guard in every group\n' +
    '`.noaction off @user` — stop guarding\n' +
    '`.noaction list`\n\n' +
    'Demoted → promoted again. Kicked → added back + promoted.\n' +
    '_The bot must be admin. To protect the bot itself, run this on a second bot with the first bot\'s number._';

export async function noactionCommand(sock, chat, msg, args) {
    if (ownerOnly(sock, chat, msg)) return;
    const say = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const g = guards();
        const a0 = (args?.[0] || '').toLowerCase();

        if (a0 === 'list') {
            const keys = Object.keys(g);
            if (!keys.length) return say('🛡️ Nobody is guarded yet.');
            const lines = [`🛡️ *guarded* · ${keys.length}`, ''];
            for (const d of keys) lines.push(`• +${d} — ${g[d].all ? 'all groups' : `${(g[d].groups || []).length} group(s)`}`);
            return say(lines.join('\n'));
        }

        if (a0 === 'off' || a0 === 'remove' || a0 === 'stop') {
            const t = await getTarget(sock, chat, msg, args.slice(1));
            if (!t) return say('❌ Usage: `.noaction off @user`');
            if (!g[t.digits]) return say(`❌ +${t.digits} is not guarded.`);
            delete g[t.digits];
            save();
            return say(`🛡️ Stopped guarding +${t.digits}.`);
        }

        const t = await getTarget(sock, chat, msg, args);
        if (!t) return say(USAGE);
        const all = args.some((x) => String(x).toLowerCase() === 'all');
        const isGroup = String(chat).endsWith('@g.us');
        if (!all && !isGroup) return say('❌ Use this inside a group, or add `all`.');

        const rec = g[t.digits] || { all: false, groups: [] };
        if (all) rec.all = true;
        else if (!rec.groups.includes(chat)) rec.groups.push(chat);
        g[t.digits] = rec;
        save();

        let warn = '';
        if (isGroup && (await botIsAdmin(sock, chat)) === false) warn = '\n\n⚠️ The bot is NOT admin in this group — protection works only after it is promoted.';
        return say(`🛡️ Guarding +${t.digits} ${all ? 'in *all groups*' : 'in *this group*'}.\nDemoted → promoted again · kicked → added back + promoted.${warn}`);
    } catch (e) {
        return say(`⚠️ noaction failed: ${e.message}`).catch(() => {});
    }
}
