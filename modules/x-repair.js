// ─────────────────────────────────────────────
//  Al-Jin · modules/x-repair.js
//  .fixkeys [own|all]  (owner)  — fixes "Waiting for this message…" on the bot's own phone.
//  Marks a repair, then restarts; start.js deletes the stale signal sessions BEFORE Baileys loads,
//  so fresh ones are created automatically. Login (creds.json) is kept — no re-pairing needed.
// ─────────────────────────────────────────────
import { reply, safe } from '../lib/x.js';
import { getPrefix } from '../core/settings.js';
import { statePath } from '../core/paths.js';
import { requestRepair } from '../core/session-repair.js';

export const fixkeys = safe('fixkeys', async (sock, chat, msg, args) => {
  const p = getPrefix();
  const mode = String(args?.[0] || 'own').toLowerCase();
  if (!['own', 'all'].includes(mode)) {
    return reply(sock, chat, msg, [
      '🔐 *Fix "Waiting for this message"*',
      `• \`${p}fixkeys\` — rebuild the bot's own-phone sessions (recommended)`,
      `• \`${p}fixkeys all\` — rebuild every session (use if "own" did not help)`,
      'The bot restarts, stays logged in and creates fresh keys by itself.',
    ].join('\n'));
  }
  requestRepair(statePath(), mode);
  await reply(sock, chat, msg, `🔐 Rebuilding ${mode === 'all' ? 'all' : "the bot's own"} encryption sessions…\n🔄 Restarting — send a new message from the bot in ~20 s to check your phone.`);
  setTimeout(() => process.exit(0), 1500);
});
