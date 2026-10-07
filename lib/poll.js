// ─────────────────────────────────────────────
//  Al-Jin · lib/poll.js
//  Poll reply mode (multi-select + toggle).
//
//  • The bot sends ONE poll that allows several selections.
//  • Every option a voter newly ticks runs its command, right away.
//  • The poll is NOT deleted or re-sent on a vote — it stays usable until its
//    time is up (AL_JIN_POLL_TTL_MS, default 60 s), then it is deleted.
//  • Un-ticking re-arms an option, so ticking it again runs it again
//    (that is how you flip a toggle ON → OFF → ON inside one poll).
//  • Commands started from a vote answer with plain text (see inPollRun),
//    so a vote never creates a second poll.
//
//  Votes are read two ways, so a change in WhatsApp/Baileys can't break it:
//    1. Baileys' own `messages.update` → pollUpdates   (handlePollUpdates)
//    2. Our own decryption of the raw vote message,     (handlePollMessage)
//  Both feed the same per-voter state, so a vote is never run twice.
//
//  RAM-only, no extra libraries. Every function is crash-safe.
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as Baileys from '@whiskeysockets/baileys';

export const POLL_TTL_MS = Number(process.env.AL_JIN_POLL_TTL_MS || 60_000);
const MAX_POLLS = 50;
const DEDUPE_MS = 2500;   // same option fired by both vote paths within this window = one run

// pollMessageId → { content, secret, key, chat, options, voters, recent, timer }
const polls = new Map();

// Set once from start.js: (sock, chat, voterKey, commandText) → runs the command.
let runner = null;
export function setPollRunner(fn) { runner = typeof fn === 'function' ? fn : null; }

// Marks "this command was started by a poll vote" for everything it awaits.
const pollRunStore = new AsyncLocalStorage();
export function inPollRun() { return pollRunStore.getStore()?.poll === true; }

const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(String(s))).digest('hex');
const stripDevice = (j) => String(j || '').replace(/:\d+(?=@)/, '');
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const hex = (b) => Buffer.from(b).toString('hex');
const voterId = (k) => (k?.fromMe ? 'me' : stripDevice(k?.participant || k?.remoteJid || 'unknown'));

function forget(id) {
  const rec = polls.get(id);
  if (!rec) return null;
  clearTimeout(rec.timer);
  polls.delete(id);
  return rec;
}

async function deletePoll(sock, rec) {
  try { await sock.sendMessage(rec.chat, { delete: rec.key }); } catch {}
}

/** The poll's encryption secret, wherever WhatsApp wrapped it. */
function secretOf(content) {
  let m = content;
  for (let i = 0; i < 4 && m; i++) {
    const s = m.messageContextInfo?.messageSecret;
    if (s) return Buffer.from(s);
    m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.deviceSentMessage?.message || null;
  }
  return null;
}

/** getMessage() hook: Baileys needs the poll creation message to decrypt votes. */
export function getPollMessage(id) {
  return polls.get(id)?.content;
}

/** Plain text for a poll title (polls do not render WhatsApp markdown). */
export function plainTitle(text = '') {
  return String(text).replace(/[*_~`]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Send a multi-select poll. `options` = [{ label, id }] (2-12 entries).
 * Returns the sent message, or null when a poll can't be used (caller falls back to text).
 */
export async function sendPoll(sock, jid, { title, options }, { quoted, onExpire } = {}) {
  try {
    if (!Array.isArray(options) || options.length < 2 || options.length > 12) return null;

    const seen = new Set();
    const clean = options.map((o, i) => {
      let label = String(o.label || `Option ${i + 1}`).slice(0, 90);
      while (seen.has(label)) label += ' ';
      seen.add(label);
      return { label, id: o.id };
    });

    const name = plainTitle(title || 'Select an option').slice(0, 250) || 'Select an option';
    const sent = await sock.sendMessage(jid, {
      poll: { name, values: clean.map((o) => o.label), selectableCount: clean.length },
    }, { quoted });

    if (!sent?.key?.id || !sent.message) return null;

    while (polls.size >= MAX_POLLS) forget(polls.keys().next().value);

    const rec = {
      content: sent.message,
      secret: secretOf(sent.message),
      key: sent.key,
      chat: jid,
      options: clean.map((o) => ({ hash: sha256(o.label), id: o.id, label: o.label })),
      voters: new Map(),   // voterId → Set(optionHash) currently ticked
      recent: new Map(),   // optionHash → last run timestamp (double-path guard)
      timer: null,
    };
    rec.timer = setTimeout(async () => {
      const r = forget(sent.key.id);
      if (!r) return;
      try { onExpire?.(); } catch {}
      await deletePoll(sock, r);
    }, POLL_TTL_MS);
    rec.timer.unref?.();
    polls.set(sent.key.id, rec);
    if (!rec.secret) console.log('[poll] ⚠️ sent poll has no messageSecret — votes may not decrypt');
    return sent;
  } catch (e) {
    console.error('[poll] send failed:', e.message);
    return null;
  }
}

// Apply one voter's CURRENT selection. Newly ticked options run; the poll stays.
async function applySelection(sock, pollId, selectedHashes, voterKey) {
  const rec = polls.get(pollId);
  if (!rec) return;

  rec.ok = true;
  const known = new Set(rec.options.map((o) => o.hash));
  const current = new Set(selectedHashes.filter((h) => known.has(h)));
  const vid = voterId(voterKey);
  const before = rec.voters.get(vid) || new Set();
  rec.voters.set(vid, current);

  const now = Date.now();
  // keep option order so several simultaneous ticks run top-to-bottom
  const added = rec.options.filter((o) => current.has(o.hash) && !before.has(o.hash));
  for (const option of added) {
    const last = rec.recent.get(option.hash) || 0;
    if (now - last < DEDUPE_MS) continue;          // other vote path already ran it
    rec.recent.set(option.hash, now);
    console.log(`[poll] vote → "${option.label}" → ${option.id}`);
    if (!runner) continue;
    try {
      await pollRunStore.run({ poll: true }, () => runner(sock, rec.chat, voterKey || {}, option.id));
    } catch (e) {
      console.error('[poll] command failed:', e.message);
    }
  }
}

/** Path 1 — Baileys already decrypted the votes (messages.update). */
export async function handlePollUpdates(sock, updates) {
  const list = Array.isArray(updates) ? updates : [updates];
  for (const u of list) {
    try {
      const pollId = u?.key?.id;
      const votes = u?.update?.pollUpdates;
      if (!pollId || !polls.has(pollId) || !votes?.length) continue;

      // latest vote per voter = that voter's full current selection
      const latest = new Map();
      for (const v of votes) {
        if (!v?.vote?.selectedOptions) continue;
        latest.set(voterId(v.pollUpdateMessageKey), v);
      }
      for (const v of latest.values()) {
        await applySelection(sock, pollId, v.vote.selectedOptions.map(hex), v.pollUpdateMessageKey);
      }
    } catch (e) {
      console.error('[poll] vote handling failed:', e.message);
    }
  }
}

/** Path 2 — raw vote message (messages.upsert); we decrypt it ourselves. */
export async function handlePollMessage(sock, msg) {
  try {
    const pu = msg?.message?.pollUpdateMessage;
    if (!pu) return;
    const pollId = pu.pollCreationMessageKey?.id;
    const rec = pollId ? polls.get(pollId) : null;
    if (!rec) return;

    if (typeof Baileys.decryptPollVote !== 'function' || !rec.secret || !pu.vote) {
      console.log('[poll] cannot decrypt ourselves (decryptPollVote/secret missing) — waiting for Baileys');
      return;
    }

    const me = uniq([sock.user?.id, sock.user?.lid].map(stripDevice));
    const k = msg.key || {};
    const creators = uniq([...me, stripDevice(rec.key?.participant)]);
    const voters = k.fromMe
      ? me
      : uniq([k.participant, k.participantAlt, k.remoteJid, k.remoteJidAlt].map(stripDevice));
    // A fromMe vote could still be addressed either way — try the other form too.
    if (k.fromMe) voters.push(...uniq([k.remoteJid, k.remoteJidAlt, k.participant].map(stripDevice)));

    let selected = null;
    outer:
    for (const pollCreatorJid of creators) {
      for (const voterJid of voters) {
        try {
          const dec = Baileys.decryptPollVote(pu.vote, {
            pollEncKey: rec.secret, pollCreatorJid, pollMsgId: pollId, voterJid,
          });
          selected = dec?.selectedOptions || [];
          break outer;
        } catch { /* wrong id combination — try next */ }
      }
    }

    if (selected === null) {
      console.log('[poll] ❌ could not decrypt vote (creators:', creators.join(','), '| voters:', voters.join(','), ')');
      setTimeout(() => {
        const r = polls.get(pollId);
        if (r && !r.warned && !r.ok) {
          r.warned = true;
          sock.sendMessage(r.chat, { text: "⚠️ I couldn't read that poll vote. Use `.replymode text` and reply with a number instead." }).catch(() => {});
        }
      }, 2500).unref?.();
      return;
    }
    await applySelection(sock, pollId, selected.map(hex), msg.key);   // empty = vote withdrawn
  } catch (e) {
    console.error('[poll] raw vote handling failed:', e.message);
  }
}
