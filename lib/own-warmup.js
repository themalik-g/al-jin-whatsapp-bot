// ─────────────────────────────────────────────
//  Al-Jin · lib/own-warmup.js
//  Best-effort helpers for the "Waiting for this message" problem on the bot's OWN phone.
//   • warmOwnIdentity(sock)  stores our own LID↔PN mapping and makes sure signal sessions with the
//                            account's other devices (the main phone) exist BEFORE the bot sends anything.
//   • baileysPatchStatus()   tells you (in the boot log) whether the LID/PN retry patch is really applied.
//  Every call is wrapped: a failure here can never stop the bot.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const MARKER = 'ALJIN-PATCH:LID-PN-RETRY';
const bare = (jid) => String(jid || '').replace(/:\d+(?=@)/, '');
const deviceOf = (jid) => Number(/:(\d+)@/.exec(String(jid || ''))?.[1] || 0);
const enc = (user, server, device) => `${user}${device ? `:${device}` : ''}@${server}`;

/** { version, patched } of the installed Baileys, read from disk (no import side effects). */
export function baileysPatchStatus(root = process.cwd()) {
  const dir = path.join(root, 'node_modules', '@whiskeysockets', 'baileys');
  let version = 'not installed'; let patched = false;
  try { version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || 'unknown'; } catch { /* missing */ }
  try { patched = fs.readFileSync(path.join(dir, 'lib', 'Utils', 'decode-wa-message.js'), 'utf8').includes(MARKER); } catch { /* missing */ }
  return { version, patched };
}

/**
 * @param {object} sock   Baileys socket (after connection 'open')
 * @param {{force?: boolean, log?: (m:string)=>void}} opts  force → rebuild the sessions even when they exist
 * @returns {Promise<{mapped:boolean, devices:number, forced:boolean}>}
 */
export async function warmOwnIdentity(sock, { force = false, log = () => {} } = {}) {
  const out = { mapped: false, devices: 0, forced: false };
  const me = sock?.authState?.creds?.me || sock?.user || {};
  if (!me.id) return out;
  const pn = bare(me.id);
  const lid = me.lid ? bare(me.lid) : null;

  // 1) our own LID ↔ PN pair — without it the phone's copy can be encrypted for the wrong identity
  try {
    const store = sock.signalRepository?.lidMapping;
    if (lid && store?.storeLIDPNMappings) { await store.storeLIDPNMappings([{ lid, pn }]); out.mapped = true; }
  } catch (e) { log(`own mapping skipped: ${e?.message}`); }

  // 2) sessions with every OTHER device of our account (phone = device 0)
  try {
    if (typeof sock.getUSyncDevices === 'function' && typeof sock.assertSessions === 'function') {
      const mine = deviceOf(me.id);
      const devs = (await sock.getUSyncDevices([pn], false, false)) || [];
      const jids = devs.filter((d) => Number(d.device || 0) !== mine)
        .map((d) => d.jid || enc(d.user || pn.split('@')[0], 's.whatsapp.net', Number(d.device || 0)));
      if (jids.length) { await sock.assertSessions(jids, !!force); out.devices = jids.length; out.forced = !!force; }
    }
  } catch (e) { log(`own-device sessions skipped: ${e?.message}`); }
  return out;
}
