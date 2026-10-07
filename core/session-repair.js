// ─────────────────────────────────────────────
//  Al-Jin · core/session-repair.js
//  Fixes "Waiting for this message. This may take a while." on the bot's OWN phone.
//
//  Cause: the signal sessions between the bot (linked device) and the account's other devices
//  (the main phone) get out of sync — after a re-pair, a LID/PN switch or a crashed write. The phone
//  can then never decrypt the copy of every message the bot sends. Other people are unaffected.
//
//  Fix: delete ONLY the stale signal sessions (+ sender-key bookkeeping) so Baileys builds fresh ones
//  on the next send. creds.json, pre-keys and app-state keys are never touched, so the bot stays linked.
//
//  modes:  own  (default) sessions of the bot's own number/LID + group sender-key memory
//          all  every session and sender key (contacts re-establish automatically on their next message)
//
//  Runs at boot, BEFORE Baileys loads the keys (its in-memory key cache would otherwise rewrite them).
//  Trigger it with  .fixkeys [own|all]  or by creating  <state dir>/repair-sessions.flag  (content: own|all).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

export const FLAG_NAME = 'repair-sessions.flag';

function ownIds(authDir) {
  const ids = new Set();
  try {
    const me = JSON.parse(fs.readFileSync(path.join(authDir, 'creds.json'), 'utf8'))?.me || {};
    for (const j of [me.id, me.lid, me.jid]) {
      const user = String(j || '').split('@')[0].split(':')[0].split('_')[0];
      if (user) ids.add(user);
    }
  } catch {}
  return [...ids];
}

/** Deletes stale signal files. Returns { removed: number, mode, own: string[] }. Never throws. */
export function repairSessions(authDir, mode = 'own') {
  const m = mode === 'all' ? 'all' : 'own';
  const own = ownIds(authDir);
  let removed = 0;
  let files = [];
  try { files = fs.readdirSync(authDir); } catch { return { removed: 0, mode: m, own }; }
  for (const f of files) {
    if (f === 'creds.json' || !f.endsWith('.json')) continue;
    let kill = false;
    if (m === 'all') kill = /^(session-|sender-key-|device-list-)/.test(f);
    else {
      kill = /^sender-key-memory-/.test(f)
        || own.some((id) => f.startsWith(`session-${id}`) || f.startsWith(`device-list-${id}`));
    }
    if (!kill) continue;
    try { fs.unlinkSync(path.join(authDir, f)); removed++; } catch {}
  }
  return { removed, mode: m, own };
}

/** Called once at startup: runs the repair when the flag file exists, then removes the flag. */
export function repairIfRequested(authDir, stateDir, log = console.log) {
  const flag = path.join(stateDir, FLAG_NAME);
  try {
    if (!fs.existsSync(flag)) return null;
    const mode = String(fs.readFileSync(flag, 'utf8') || '').trim().toLowerCase() === 'all' ? 'all' : 'own';
    try { fs.unlinkSync(flag); } catch {}
    const r = repairSessions(authDir, mode);
    log(`[session-repair] mode=${r.mode} · removed ${r.removed} stale session file(s)`);
    return r;
  } catch (e) {
    try { log(`[session-repair] failed: ${e?.message}`); } catch {}
    return null;
  }
}

export function requestRepair(stateDir, mode = 'own') {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, FLAG_NAME), mode === 'all' ? 'all' : 'own');
}
