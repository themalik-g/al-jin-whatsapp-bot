// ─────────────────────────────────────────────
// Al-Jin · modules/noaction.js
// .noaction — keeps chosen numbers safe inside groups.
//   demoted  → promoted again straight away
//   kicked   → added back and promoted (invite link sent if WhatsApp refuses the add,
//              and promoted automatically when they rejoin)
//   guard list persists on disk: if the bot is removed and re-added, the guard
//   is still active and missing/demoted guarded members are restored.
//
//   .noaction @user            guard in THIS group
//   .noaction @user all        guard in every group where the bot is admin
//   .noaction off @user        stop guarding
//   .noaction list
//
// Limits (WhatsApp rules, not bugs):
//  • the bot must be admin — it can never restore ITSELF; let a second bot guard it
//  • it ignores only: the bot itself, other guarded numbers (anti-loop), and people who leave on their own
//    (group owner / bot owner / developer actions are NOT exempt)
//  • max 3 restores per person per group every 10 min, then it pauses and tells you
// ─────────────────────────────────────────────
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { inState } from '../core/paths.js';
import { getBestUserJid, digitsOf, resolvePnToLid, stripDevice } from '../core/jid-resolver.js';
import { getTarget, ownerOnly, notifyOwner } from '../lib/targets.js';

const DEBUG = process.env.WRAITH_DEBUG === '1';
const FILE = () => inState('noaction.json');
const ACT_DELAY_MS = 0;
const WINDOW_MS = 5 * 60_000;
const MAX_RESTORES = 12;      // generous: speed matters more than throttling
const PAUSE_MS = 30_000;

// Guard records live in state/noaction.json and are keyed by phone number:
//   { "<digits>": { all, groups: [chatJid], lids: [lidJid], pending: [chatJid] } }
// The file is never touched when the bot leaves / is removed from a group, so
// the guard list is still there when the bot is added back.
let cache = null;
const attempts = new Map();
const paused = new Set();
const attached = new WeakSet();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function guards() {
    if (!cache) {
        cache = readJson(FILE(), {}) || {};
        for (const rec of Object.values(cache)) {
            rec.groups ||= []; rec.lids ||= []; rec.pending ||= [];
        }
    }
    return cache;
}
function save() { writeJsonAtomic(FILE(), cache || {}); }

function isGuarded(d, chat) {
    const g = guards()[d];
    return !!g && (g.all === true || (g.groups || []).includes(chat));
}
// A removed member can no longer be looked up in group metadata, so we keep
// each guarded person's LIDs on disk and match kicked LIDs against them.
function guardedByLid(lid, chat) {
    const c = stripDevice(lid);
    for (const [d, rec] of Object.entries(guards())) {
        if ((rec.lids || []).includes(c) && isGuarded(d, chat)) return d;
    }
    return null;
}
function rememberLid(d, lid) {
    const rec = guards()[d];
    if (!rec || !lid) return;
    const c = stripDevice(lid);
    if (!c.endsWith('@lid') || rec.lids.includes(c)) return;
    rec.lids.push(c);
    save();
}
async function learnLids(sock, d, chat) {
    try {
        const r = await resolvePnToLid(sock, `${d}@s.whatsapp.net`);
        if (r?.lid) rememberLid(d, r.lid);
    } catch { /* ignore */ }
    if (chat && String(chat).endsWith('@g.us')) {
        try {
            const meta = await sock.groupMetadata(chat);
            for (const p of meta.participants || []) {
                const pn = digitsOf(p.phoneNumber || p.pn || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : ''));
                if (pn === d) rememberLid(d, p.lid || (String(p.id).endsWith('@lid') ? p.id : null));
            }
        } catch { /* ignore */ }
    }
}

async function idsOf(sock, chat, p) {
    const jid = typeof p === 'string' ? p : (p?.id || p?.jid || null);
    const pn = typeof p === 'object' ? p?.phoneNumber : null;
    const ids = new Set();
    if (jid) {
        ids.add(digitsOf(jid));
        try { ids.add(digitsOf(await getBestUserJid(jid, sock, chat))); } catch { /* ignore */ }
        const viaLid = guardedByLid(jid, chat);
        if (viaLid) ids.add(viaLid);
    }
    if (pn) ids.add(digitsOf(pn));
    ids.delete('');
    return { jid, ids };
}

async function groupName(sock, chat) {
    try { return (await sock.groupMetadata(chat))?.subject || chat; } catch { return chat; }
}

// Promote with rapid retries (a freshly added member needs a moment to register).
// Tries the original JID, the phone-number JID and any stored LIDs.
const PROMOTE_BACKOFF = [0, 120, 250, 500, 900, 1500];
async function tryPromote(sock, chat, jid, d) {
    const forms = [...new Set([jid, `${d}@s.whatsapp.net`, ...(guards()[d]?.lids || [])].filter(Boolean))];
    let lastErr = null;
    for (const wait of PROMOTE_BACKOFF) {
        if (wait) await sleep(wait);
        for (const f of forms) {
            try {
                const res = await sock.groupParticipantsUpdate(chat, [f], 'promote');
                const st = String(res?.[0]?.status || '200');
                if (st === '200') return true;
                lastErr = new Error(`status ${st}`);
            } catch (e) { lastErr = e; }
        }
        // not-authorized means WE are not admin any more: retrying will not help
        if (/not-authorized|forbidden|403/i.test(lastErr?.message || '')) break;
    }
    if (lastErr && DEBUG) console.log('[noaction] promote failed', lastErr.message);
    return false;
}

function markPending(d, chat) {
    const rec = guards()[d];
    if (rec && !rec.pending.includes(chat)) { rec.pending.push(chat); save(); }
}
function clearPending(d, chat) {
    const rec = guards()[d];
    if (rec && rec.pending.includes(chat)) { rec.pending = rec.pending.filter((x) => x !== chat); save(); }
}

async function addBack(sock, chat, jid, d, who, authorLabel, gname, verb) {
    // `add` must use the phone-number JID, never a LID. Retry transient errors fast.
    const pnJid = `${d}@s.whatsapp.net`;
    let res; let err = null;
    for (let i = 0; i < 3; i++) {
        err = null;
        try { res = await sock.groupParticipantsUpdate(chat, [pnJid], 'add'); } catch (e) { err = e; }
        const st = String(res?.[0]?.status || '');
        if (!err && (st === '200' || st === '409' || st === '403' || st === '408' || st === '401')) break;
        if (err && /not-authorized|forbidden|403/i.test(err.message || '')) break;
        await sleep(150);
    }
    const status = String(res?.[0]?.status || (err ? 'error' : ''));
    if (status === '200' || status === '409') {
        clearPending(d, chat);
        const ok = await tryPromote(sock, chat, jid, d);
        gname = gname || await groupName(sock, chat);
        return notifyOwner(sock, `🛡️ *noaction*\n${who} was ${verb} by ${authorLabel}\ngroup · ${gname}\n→ added back${ok ? ' and promoted ✅' : ' (promote failed — check bot is admin)'}`);
    }
    // WhatsApp refused (privacy / recently left). Send the invite link and
    // remember to promote them the moment they rejoin.
    markPending(d, chat);
    gname = gname || await groupName(sock, chat);
    let sent = false;
    try {
        const code = await sock.groupInviteCode(chat);
        await sock.sendMessage(pnJid, { text: `You were removed from *${gname}*.\nRejoin: https://chat.whatsapp.com/${code}` });
        sent = true;
    } catch { /* ignore */ }
    const why = err ? (/not-authorized|forbidden|403/i.test(err.message) ? 'the bot is not admin there' : err.message) : `WhatsApp refused the add (status ${status || '?'})`;
    return notifyOwner(sock, `🛡️ *noaction*\n${who} was ${verb} by ${authorLabel}\ngroup · ${gname}\n→ ${why}; invite link ${sent ? 'sent to them privately' : 'could not be sent'}. They will be promoted automatically when they rejoin.`);
}

async function restore(sock, chat, action, jid, d, authorLabel) {
    const who = `+${d}`;
    try {
        if (action === 'demote') {
            const ok = await tryPromote(sock, chat, jid, d);
            const gname = await groupName(sock, chat);
            return notifyOwner(sock, `🛡️ *noaction*\n${who} was demoted by ${authorLabel}\ngroup · ${gname}\n→ ${ok ? 'promoted again ✅' : 'promote failed — is the bot admin?'}`);
        }
        return await addBack(sock, chat, jid, d, who, authorLabel, null, 'removed');
    } catch (e) {
        const notAdmin = /not-authorized|forbidden|403/i.test(e?.message || '');
        return notifyOwner(sock, `⚠️ *noaction* failed for ${who}: ${notAdmin ? 'the bot is not admin there' : e.message}`);
    }
}

// Runs when the bot becomes admin (or on start-up): puts guarded numbers back
// in groups they were explicitly guarded in — covers kicks/demotes that
// happened while the bot was removed or not admin.
const reconciling = new Set();
async function reconcile(sock, chat) {
    if (!String(chat).endsWith('@g.us') || reconciling.has(chat)) return;
    const wanted = Object.entries(guards()).filter(([, rec]) => (rec.groups || []).includes(chat));
    if (!wanted.length) return;
    reconciling.add(chat);
    try {
        if ((await botIsAdmin(sock, chat)) !== true) return;
        const meta = await sock.groupMetadata(chat);
        const gname = meta?.subject || chat;
        for (const [d, rec] of wanted) {
            const part = (meta.participants || []).find((p) => {
                const pn = digitsOf(p.phoneNumber || p.pn || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : ''));
                return pn === d || (rec.lids || []).includes(stripDevice(p.lid || p.id || ''));
            });
            if (part) {
                rememberLid(d, part.lid || (String(part.id).endsWith('@lid') ? part.id : null));
                if (!part.admin) {
                    await sleep(ACT_DELAY_MS);
                    const ok = await tryPromote(sock, chat, part.id, d);
                    notifyOwner(sock, `🛡️ *noaction*\n+${d} was not admin in ${gname}\n→ ${ok ? 'promoted again ✅' : 'promote failed'}`);
                }
            } else {
                await sleep(ACT_DELAY_MS);
                await addBack(sock, chat, null, d, `+${d}`, 'someone (while the bot was away)', gname, 'missing');
            }
        }
    } catch (e) { if (DEBUG) console.log('[noaction:reconcile]', e.message); }
    finally { reconciling.delete(chat); }
}

async function onUpdate(sock, u) {
    const chat = u?.id;
    const action = u?.action;
    const members = u?.participants || [];
    if (!chat || !String(chat).endsWith('@g.us') || !members.length) return;
    if (!['demote', 'remove', 'add', 'promote'].includes(action)) return;
    const g = guards();
    if (!Object.keys(g).length) return;

    const me = new Set([digitsOf(sock.user?.id), digitsOf(sock.user?.lid)]);
    me.delete('');

    // Bot got (re)added or promoted → re-check guarded members.
    if (action === 'add' || action === 'promote') {
        for (const m of members) {
            const { jid, ids } = await idsOf(sock, chat, m);
            if ([...ids].some((x) => me.has(x))) {
                reconcile(sock, chat).catch(() => {});
                continue;
            }
            if (action !== 'add') continue;
            // A guarded person rejoined after a refused add → promote now.
            const d = [...ids].find((x) => g[x] && (g[x].pending || []).includes(chat));
            if (d) {
                clearPending(d, chat);
                await sleep(300);
                const ok = await tryPromote(sock, chat, jid, d);
                notifyOwner(sock, `🛡️ *noaction*\n+${d} rejoined ${await groupName(sock, chat)}\n→ ${ok ? 'promoted again ✅' : 'promote failed — is the bot admin?'}`);
            }
        }
        return;
    }

    // ── HOT PATH (remove / demote) ─────────────────────────────
    // No network lookups before the restore starts: match by digits and the
    // LIDs stored on disk, then fire add/promote immediately.
    const author = new Set();
    for (const raw of [u.author, u.authorPn]) {
        if (!raw) continue;
        author.add(digitsOf(raw));
        const viaLid = guardedByLid(raw, chat);
        if (viaLid) author.add(viaLid);
    }
    author.delete('');
    for (const a of author) {
        if (me.has(a) || g[a]) return; // our own or another guarded number's action (prevents loops)
    }
    const authorLabel = [...author].find((x) => /^\d+$/.test(x)) ? `+${[...author].find((x) => /^\d+$/.test(x))}` : 'someone';

    await Promise.all(members.map(async (m) => {
        const jid = typeof m === 'string' ? m : (m?.id || m?.jid || null);
        if (!jid) return;
        const pn = typeof m === 'object' ? m?.phoneNumber : null;

        // fast match
        let d = [digitsOf(jid), digitsOf(pn), guardedByLid(jid, chat)].find((x) => x && isGuarded(x, chat));
        // slow match only when the fast one fails and it is a LID we never learned
        if (!d && String(jid).endsWith('@lid')) {
            const { ids } = await idsOf(sock, chat, m);
            d = [...ids].find((x) => isGuarded(x, chat));
        }
        if (!d || me.has(d)) return;
        if (String(jid).endsWith('@lid')) rememberLid(d, jid);
        if (action === 'remove' && author.has(d)) return; // they left on their own

        const key = `${chat}|${d}`;
        if (paused.has(key)) return;
        const now = Date.now();
        const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
        if (recent.length >= MAX_RESTORES) {
            paused.add(key);
            setTimeout(() => paused.delete(key), PAUSE_MS).unref?.();
            notifyOwner(sock, `⏸️ *noaction* paused for +${d} in ${chat}: ${MAX_RESTORES} restores in 5 min (last by ${authorLabel}). Resumes in 30s.`);
            return;
        }
        recent.push(now);
        attempts.set(key, recent);

        await restore(sock, chat, action, jid, d, authorLabel);
    }));
}

export function startNoAction(sock) {
    if (!sock?.ev || attached.has(sock)) return;
    attached.add(sock);
    sock.ev.on('group-participants.update', (u) => {
        onUpdate(sock, u).catch((e) => { if (DEBUG) console.log('[noaction]', e.message); });
    });
    // After (re)connect: refresh LIDs and re-check explicitly guarded groups, immediately.
    (async () => {
        try {
            const groups = new Set();
            for (const [d, rec] of Object.entries(guards())) {
                for (const gj of rec.groups || []) groups.add(gj);
                await learnLids(sock, d, (rec.groups || [])[0]);
            }
            for (const gj of groups) await reconcile(sock, gj);
        } catch (e) { if (DEBUG) console.log('[noaction:startup]', e.message); }
    })();
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
    '`.noaction list`\n' +
    '\n' +
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
        rec.lids ||= []; rec.pending ||= [];
        g[t.digits] = rec;
        save();
        await learnLids(sock, t.digits, isGroup ? chat : null);

        let warn = '';
        if (isGroup && (await botIsAdmin(sock, chat)) === false) warn = '\n\n⚠️ The bot is NOT admin in this group — protection works only after it is promoted.';
        return say(`🛡️ Guarding +${t.digits} ${all ? 'in *all groups*' : 'in *this group*'}.\nDemoted → promoted again · kicked → added back + promoted.${warn}`);
    } catch (e) {
        return say(`⚠️ noaction failed: ${e.message}`).catch(() => {});
    }
}
