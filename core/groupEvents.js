// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · core/groupEvents.js
// Welcome / goodbye messages + PDD on membership changes.
// Wired in start.js → 'group-participants.update'
// ─────────────────────────────────────────────
import { getPrefix } from '../core/settings.js';
import { getWelcomeConfig, getPddConfig, getProtRolesConfig } from '../modules/group.js';
import { isOwner } from '../core/identity.js';

function mentionText(participants) {
  return participants
    .map((p) => '@' + String(p).split('@')[0].split(':')[0])
    .join(' ');
}

export function handleGroupParticipantUpdate(sock, update) {
  try {
    const chat = update?.id;
    const action = update?.action;
    const participants = (update?.participants || []).filter(Boolean);
    if (!chat || !action || !participants.length) return;
    if (!String(chat).endsWith('@g.us')) return;

    const welcomeCfg = getWelcomeConfig()[chat];
    const pddCfg = getPddConfig()[chat];
    const protRolesCfg = getProtRolesConfig()[chat];
    const authorJid = update?.author;
    const authorIsOwner = authorJid ? (authorJid.includes(sock.user?.id?.split(':')[0]) || isOwner(authorJid)) : false;

    // Handle Anti-Promote & Anti-Demote
    if (protRolesCfg?.antipromote && action === 'promote' && !authorIsOwner) {
      sock.sendMessage(chat, {
        text: `🛡️ *Anti-Promote Triggered!* Reverting unauthorized promotion by @${authorJid ? authorJid.split('@')[0] : 'unknown'}...`,
        mentions: authorJid ? [authorJid] : []
      }).catch(() => {});
      sock.groupParticipantsUpdate(chat, participants, 'demote').catch(() => {});
    }

    if (protRolesCfg?.antidemote && action === 'demote' && !authorIsOwner) {
      sock.sendMessage(chat, {
        text: `🛡️ *Anti-Demote Triggered!* Reverting unauthorized demotion by @${authorJid ? authorJid.split('@')[0] : 'unknown'}...`,
        mentions: authorJid ? [authorJid] : []
      }).catch(() => {});
      sock.groupParticipantsUpdate(chat, participants, 'promote').catch(() => {});
    }

    // Handle PDD (Promote/Demote Detection)
    if (pddCfg?.enabled) {
      if (action === 'promote') {
        const text = `👑 *Admin Promotion Detected (PDD)*\n\nThe following member(s) have been promoted to Admin:\n${mentionText(participants)}`;
        sock.sendMessage(chat, { text, mentions: participants }).catch(() => {});
      } else if (action === 'demote') {
        const text = `⚠️ *Admin Demotion Detected (PDD)*\n\nThe following member(s) have been demoted from Admin:\n${mentionText(participants)}`;
        sock.sendMessage(chat, { text, mentions: participants }).catch(() => {});
      }
    }

    // Handle Welcome / Goodbye
    if (!welcomeCfg) return;

    if (action === 'add' && welcomeCfg.welcome) {
      const text =
        `👋 Welcome ${mentionText(participants)}!\n` +
        `Enjoy your stay. Type \`${getPrefix()}help\` to see what the bot can do.`;
      sock.sendMessage(chat, { text, mentions: participants }).catch(() => {});
      return;
    }

    if ((action === 'remove' || action === 'leave') && welcomeCfg.goodbye) {
      const text = `👋 Goodbye ${mentionText(participants)}.`;
      sock.sendMessage(chat, { text, mentions: participants }).catch(() => {});
      return;
    }
  } catch (e) {
    console.error('[groupEvents]', e.message);
  }
}
