// ─────────────────────────────────────────────
// Al-Jin · modules/group.js
// Phase 3: Group management commands
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { isOwner, ownerJid } from '../core/identity.js';
import { readJson, writeJsonAtomic } from '../core/state-io.js';
import { inState } from '../core/paths.js';
import { withTempFile } from '../lib/net.js';
import { chunkText } from '../lib/net.js';

const WELCOME_FILE = () => inState('welcome.json');
const CALLS_FILE = () => inState('calls.json');
const PDD_FILE = () => inState('pdd.json');

function ownerOnly(sock, chat, msg) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) {
    sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg }).catch(() => {});
    return true;
  }
  return false;
}
function isGroup(chat) {
  return chat.endsWith('@g.us');
}

async function canManageGroup(sock, chat, msg) {
  if (msg.key.fromMe) return true;
  const from = msg.key.participant || msg.key.remoteJid;
  if (isOwner(from)) return true;
  try {
    const meta = await sock.groupMetadata(chat);
    const norm = (j) => String(j || '').split(':')[0].replace(/\D/g, '');
    const p = (meta.participants || []).find((x) => norm(x.id) === norm(from));
    if (p?.admin) return true;
  } catch {}
  return false;
}

async function sendChunked(sock, chat, msg, text) {
  for (const p of chunkText(text, 3800)) await sock.sendMessage(chat, { text: p }, { quoted: msg });
}

// ── Welcome / Goodbye config (read by core/groupEvents.js) ──────────────────
export function getWelcomeConfig() {
  return readJson(WELCOME_FILE(), {});
}
export function setWelcomeConfig(chat, patch) {
  const cfg = getWelcomeConfig();
  cfg[chat] = { ...(cfg[chat] || {}), ...patch };
  writeJsonAtomic(WELCOME_FILE(), cfg);
}

// ── Promote / Demote Detection (PDD) Config ────────────────────────────────
export function getPddConfig() {
  return readJson(PDD_FILE(), {});
}
export function setPddConfig(chat, patch) {
  const cfg = getPddConfig();
  cfg[chat] = { ...(cfg[chat] || {}), ...patch };
  writeJsonAtomic(PDD_FILE(), cfg);
}

export async function pddCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }

  const arg = (args?.[0] || '').toLowerCase();
  if (arg === 'on') {
    setPddConfig(chat, { enabled: true });
    return sock.sendMessage(chat, { text: '✅ Promote/Demote Detection (*PDD*) *enabled* for this group.' }, { quoted: msg });
  }
  if (arg === 'off') {
    setPddConfig(chat, { enabled: false });
    return sock.sendMessage(chat, { text: '✅ Promote/Demote Detection (*PDD*) *disabled* for this group.' }, { quoted: msg });
  }

  const cfg = getPddConfig()[chat] || {};
  return sock.sendMessage(chat, {
    text: `🛡️ *Promote/Demote Detection (PDD)*\n\nStatus: *${cfg.enabled ? 'ON' : 'OFF'}*\n\nUsage:\n• \`.pdd on\`\n• \`.pdd off\``
  }, { quoted: msg });
}

export async function welcomeCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }
  const a0 = (args?.[0] || '').toLowerCase();
  const cfg = getWelcomeConfig()[chat] || {};
  if (a0 === 'on') {
    setWelcomeConfig(chat, { welcome: true });
    return sock.sendMessage(chat, { text: '✅ Welcome messages *enabled* for this group.' }, { quoted: msg });
  }
  if (a0 === 'off') {
    setWelcomeConfig(chat, { welcome: false });
    return sock.sendMessage(chat, { text: '✅ Goodbye messages *disabled* for this group.' }, { quoted: msg });
  }
  await sock.sendMessage(chat, { text: `👋 *welcome*\n\nstatus · *${cfg.welcome ? 'ON' : 'OFF'}*\n\n\`.welcome on\` / \`.welcome off\`` }, { quoted: msg });
}

export async function goodbyeCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }
  const a0 = (args?.[0] || '').toLowerCase();
  const cfg = getWelcomeConfig()[chat] || {};
  if (a0 === 'on') {
    setWelcomeConfig(chat, { goodbye: true });
    return sock.sendMessage(chat, { text: '✅ Goodbye messages *enabled* for this group.' }, { quoted: msg });
  }
  if (a0 === 'off') {
    setWelcomeConfig(chat, { goodbye: false });
    return sock.sendMessage(chat, { text: '✅ Goodbye messages *disabled* for this group.' }, { quoted: msg });
  }
  await sock.sendMessage(chat, { text: `👋 *goodbye*\n\nstatus · *${cfg.goodbye ? 'ON' : 'OFF'}*\n\n\`.goodbye on\` / \`.goodbye off\`` }, { quoted: msg });
}

async function listPending(sock, chat) {
  if (typeof sock.groupRequestParticipantsList === 'function') {
    try {
      const res = await sock.groupRequestParticipantsList(chat);
      const list = Array.isArray(res) ? res : (res?.participants || res?.requests || []);
      const jids = list
        .map((p) => (typeof p === 'string' ? p : (p?.jid || p?.id)))
        .filter(Boolean);
      if (jids.length) return jids;
      return [];
    } catch {}
  }
  try {
    const meta = await sock.groupMetadata(chat);
    const flagged = (meta.participants || [])
      .filter((p) => p && (p.pending || p.request || p.membership === 'request' || p.joinApproval === false))
      .map((p) => p.id)
      .filter(Boolean);
    return flagged;
  } catch {}
  return null;
}

export async function kickallCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const meta = await sock.groupMetadata(chat);
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const protectedJids = new Set([botJid, meta.owner, ownerJid()].filter(Boolean));
    const targets = meta.participants
      .filter((p) => !protectedJids.has(p.id) && p.admin == null)
      .map((p) => p.id);
    if (!targets.length) return sock.sendMessage(chat, { text: '❌ No members to remove.' }, { quoted: msg });

    let removed = 0;
    for (let i = 0; i < targets.length; i += 10) {
      const batch = targets.slice(i, i + 10);
      try {
        const res = await sock.groupParticipantsUpdate(chat, batch, 'remove');
        removed += (res || []).filter((r) => r.status === '200').length;
      } catch {}
    }
    await sock.sendMessage(chat, { text: `✅ Removed *${removed}* member${removed !== 1 ? 's' : ''}.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ kickall failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function kickccCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const code = (args?.[0] || '').replace(/\D/g, '');
    if (!code) return sock.sendMessage(chat, { text: '❌ Provide a country code. Example: `.kickcc 92` for Pakistan.' }, { quoted: msg });

    const meta = await sock.groupMetadata(chat);
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const protectedJids = new Set([botJid, meta.owner, ownerJid()].filter(Boolean));
    const targets = meta.participants
      .filter((p) => {
        const digits = p.id.split('@')[0].replace(/\D/g, '');
        return digits.startsWith(code) && !protectedJids.has(p.id) && p.admin == null;
      })
      .map((p) => p.id);
    if (!targets.length) return sock.sendMessage(chat, { text: `❌ No members with country code +${code}.` }, { quoted: msg });

    let removed = 0;
    for (let i = 0; i < targets.length; i += 10) {
      const batch = targets.slice(i, i + 10);
      try {
        const res = await sock.groupParticipantsUpdate(chat, batch, 'remove');
        removed += (res || []).filter((r) => r.status === '200').length;
      } catch {}
    }
    await sock.sendMessage(chat, { text: `✅ Removed *${removed}* member${removed !== 1 ? 's' : ''} with code +${code}.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ kickcc failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function setdescCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const desc = (args || []).join(' ').trim();
    if (!desc) return sock.sendMessage(chat, { text: '❌ Provide a description.' }, { quoted: msg });
    await sock.groupUpdateDescription(chat, desc);
    await sock.sendMessage(chat, { text: '✅ Group description updated.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ setdesc failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function setgppCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) return sock.sendMessage(chat, { text: '❌ Reply to an image with `.setgpp`.' }, { quoted: msg });

    const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);

    await sock.updateProfilePicture(chat, buffer);
    await sock.sendMessage(chat, { text: '✅ Group profile picture updated.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ setgpp failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function approveallCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const pending = await listPending(sock, chat);
    if (pending === null) {
      return sock.sendMessage(chat, { text: '❌ This Baileys build cannot list pending requests. Update `@whiskeysockets/baileys` to ≥ 6.7.' }, { quoted: msg });
    }
    if (!pending.length) return sock.sendMessage(chat, { text: '❌ No pending join requests.' }, { quoted: msg });
    await sock.groupRequestParticipantsUpdate(chat, pending, 'approve');
    await sock.sendMessage(chat, { text: `✅ Approved *${pending.length}* request${pending.length !== 1 ? 's' : ''}.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ approveall failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function declineallCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const pending = await listPending(sock, chat);
    if (pending === null) {
      return sock.sendMessage(chat, { text: '❌ This Baileys build cannot list pending requests. Update `@whiskeysockets/baileys` to ≥ 6.7.' }, { quoted: msg });
    }
    if (!pending.length) return sock.sendMessage(chat, { text: '❌ No pending join requests.' }, { quoted: msg });
    await sock.groupRequestParticipantsUpdate(chat, pending, 'reject');
    await sock.sendMessage(chat, { text: `✅ Declined *${pending.length}* request${pending.length !== 1 ? 's' : ''}.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ declineall failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function leaveCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    await sock.sendMessage(chat, { text: '👋 Leaving this group…' }, { quoted: msg });
    await sock.groupLeave(chat);
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ leave failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function joinCommand(sock, chat, msg, args) {
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const link = (args?.[0] || '').trim();
    if (!link) return sock.sendMessage(chat, { text: '❌ Usage: `.join <https://chat.whatsapp.com/CODE>`' }, { quoted: msg });
    const code = link.split('chat.whatsapp.com/')[1]?.split(/[?#]/)[0];
    if (!code) return sock.sendMessage(chat, { text: '❌ Invalid invite link.' }, { quoted: msg });
    await sock.groupAcceptInvite(code);
    await sock.sendMessage(chat, { text: '✅ Joined the group.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ join failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function openCommand(sock, chat, msg) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    await sock.groupSettingUpdate(chat, 'not_announcement');
    await sock.sendMessage(chat, { text: '🔓 Group opened. All members can send messages.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ open failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function closeCommand(sock, chat, msg) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    await sock.groupSettingUpdate(chat, 'announcement');
    await sock.sendMessage(chat, { text: '🔒 Group closed. Only admins can send messages.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ close failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .tagall / .hidetag / .tag admin / .hidetag admin ────────────────────────
export async function tagallCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const meta = await sock.groupMetadata(chat);
    let participants = meta.participants || [];
    if (!participants.length) return sock.sendMessage(chat, { text: '❌ No members found.' }, { quoted: msg });

    const isOnlyAdmin = (args?.[0] || '').toLowerCase() === 'admin' || (args?.[0] || '').toLowerCase() === 'admins';
    const textArgs = isOnlyAdmin ? args.slice(1) : args;

    if (isOnlyAdmin) {
      participants = participants.filter((p) => p.admin != null);
      if (!participants.length) return sock.sendMessage(chat, { text: '❌ No admins found in this group.' }, { quoted: msg });
    }

    const textArg = (textArgs || []).join(' ').trim();
    const mentions = participants.map((p) => p.id);

    let body = `📢 *Attention ${isOnlyAdmin ? 'Admins' : 'Everyone'}!*${textArg ? `\n\n💬 _${textArg}_` : ''}\n\n`;
    participants.forEach((p, idx) => {
      const num = p.id.split('@')[0];
      body += `${idx + 1}. @${num}${p.admin ? ' 👑' : ''}\n`;
    });

    await sock.sendMessage(chat, { text: body, mentions }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ tagall failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .tagallnoadmin / .hidetagnoadmin — same as tagall/hidetag but only NON-admin members ──
async function nonAdminMembers(sock, chat) {
  const meta = await sock.groupMetadata(chat);
  const norm = (j) => String(j || '').split(':')[0].replace(/\D/g, '');
  const me = norm(sock.user?.id);
  return (meta.participants || []).filter((p) => p.admin == null && norm(p.id) !== me);
}

export async function tagallnoadminCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const members = await nonAdminMembers(sock, chat);
    if (!members.length) return sock.sendMessage(chat, { text: '❌ No non-admin members found.' }, { quoted: msg });
    const textArg = (args || []).join(' ').trim();
    let body = `📢 *Attention Members!*${textArg ? `\n\n💬 _${textArg}_` : ''}\n\n`;
    members.forEach((p, i) => { body += `${i + 1}. @${p.id.split('@')[0]}\n`; });
    await sock.sendMessage(chat, { text: body, mentions: members.map((p) => p.id) }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ tagallnoadmin failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function hidetagnoadminCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const members = await nonAdminMembers(sock, chat);
    if (!members.length) return sock.sendMessage(chat, { text: '❌ No non-admin members found.' }, { quoted: msg });
    let text = (args || []).join(' ').trim();
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!text && quoted) text = quoted.conversation || quoted.extendedTextMessage?.text || '';
    if (!text) text = '📢 Notification for Members';
    await sock.sendMessage(chat, { text, mentions: members.map((p) => p.id) }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ hidetagnoadmin failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function hidetagCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const meta = await sock.groupMetadata(chat);
    let participants = meta.participants || [];
    if (!participants.length) return sock.sendMessage(chat, { text: '❌ No members found.' }, { quoted: msg });

    const isOnlyAdmin = (args?.[0] || '').toLowerCase() === 'admin' || (args?.[0] || '').toLowerCase() === 'admins';
    const textArgs = isOnlyAdmin ? args.slice(1) : args;

    if (isOnlyAdmin) {
      participants = participants.filter((p) => p.admin != null);
      if (!participants.length) return sock.sendMessage(chat, { text: '❌ No admins found in this group.' }, { quoted: msg });
    }

    let messageText = (textArgs || []).join(' ').trim();
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!messageText && quoted) {
      messageText = quoted.conversation || quoted.extendedTextMessage?.text || `Attention group ${isOnlyAdmin ? 'admins' : 'members'}!`;
    }

    if (!messageText) messageText = `📢 Notification for ${isOnlyAdmin ? 'Admins' : 'Members'}`;

    const mentions = participants.map((p) => p.id);
    await sock.sendMessage(chat, { text: messageText, mentions }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ hidetag failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function muteCommand(sock, chat, msg, args) {
  try {
    const duration = (args?.[0] || '').toLowerCase();
    let ms = 8 * 60 * 60 * 1000;
    if (duration.endsWith('h')) ms = parseInt(duration) * 3600_000;
    else if (duration.endsWith('d')) ms = parseInt(duration) * 86400_000;
    else if (duration === 'forever') ms = 100 * 365 * 86400_000;
    await sock.chatModify({ mute: ms }, chat);
    await sock.sendMessage(chat, { text: `🔇 Muted for ${duration || '8h'}.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ mute failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function unmuteCommand(sock, chat, msg) {
  try {
    await sock.chatModify({ mute: null }, chat);
    await sock.sendMessage(chat, { text: '🔊 Unmuted.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ unmute failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function archiveCommand(sock, chat, msg) {
  try {
    await sock.chatModify({ archive: true, lastMessages: [] }, chat);
    await sock.sendMessage(chat, { text: '📦 Archived.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ archive failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function unarchiveCommand(sock, chat, msg) {
  try {
    await sock.chatModify({ archive: false, lastMessages: [] }, chat);
    await sock.sendMessage(chat, { text: '📤 Unarchived.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ unarchive failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function clearchatCommand(sock, chat, msg) {
  try {
    await sock.chatModify({ clear: { messages: [{ id: msg.key.id, fromMe: msg.key.fromMe, timestamp: msg.messageTimestamp }] } }, chat);
    await sock.sendMessage(chat, { text: '🧹 Chat cleared.' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ clearchat failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export function getCallsConfig() { return readJson(CALLS_FILE(), { reject: false }); }
export function setCallsConfig(patch) { writeJsonAtomic(CALLS_FILE(), { ...getCallsConfig(), ...patch }); }

const WARNS_FILE = () => inState('warns.json');
const ANTIBOT_FILE = () => inState('antibot.json');
const PROT_ROLES_FILE = () => inState('group_roles_prot.json');

export function getWarnsConfig() { return readJson(WARNS_FILE(), {}); }
export function setWarnsConfig(chat, userJid, count) {
  const cfg = getWarnsConfig();
  if (!cfg[chat]) cfg[chat] = {};
  cfg[chat][userJid] = count;
  writeJsonAtomic(WARNS_FILE(), cfg);
}

export function getAntibotConfig() { return readJson(ANTIBOT_FILE(), {}); }
export function setAntibotConfig(chat, enabled) {
  const cfg = getAntibotConfig();
  cfg[chat] = { enabled };
  writeJsonAtomic(ANTIBOT_FILE(), cfg);
}

export function getProtRolesConfig() { return readJson(PROT_ROLES_FILE(), {}); }
export function setProtRolesConfig(chat, patch) {
  const cfg = getProtRolesConfig();
  cfg[chat] = { ...(cfg[chat] || {}), ...patch };
  writeJsonAtomic(PROT_ROLES_FILE(), cfg);
}

// ── .gclone ─────────────────────────────────────────────────────────────────
export async function gcloneCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;

  try {
    await sock.sendMessage(chat, { text: '👥 Scraping group details and cloning group...' }, { quoted: msg });

    const meta = await sock.groupMetadata(chat);
    const title = meta.subject || 'Cloned Group';
    const description = meta.desc || '';

    // Download current group picture
    let pfpBuf = null;
    try {
      const pfpUrl = await sock.profilePictureUrl(chat, 'image');
      if (pfpUrl) {
        const res = await fetch(pfpUrl);
        if (res.ok) pfpBuf = Buffer.from(await res.arrayBuffer());
      }
    } catch {}

    const fromUser = msg.key.participant || msg.key.remoteJid;
    const cleanNum = fromUser.split('@')[0].split(':')[0].replace(/\D/g, '');
    const callerJid = cleanNum + '@s.whatsapp.net';

    // Create new group with caller
    const newGroup = await sock.groupCreate(title, [callerJid]);
    const newJid = newGroup.id;

    if (description && typeof sock.groupUpdateDescription === 'function') {
      await sock.groupUpdateDescription(newJid, description).catch(() => {});
    }

    if (pfpBuf) {
      await sock.updateProfilePicture(newJid, pfpBuf).catch(() => {});
    }

    await sock.sendMessage(chat, { text: `✅ *Group Cloned Successfully!*\n\n📌 *New Group:* ${title}\n🆔 *JID:* \`${newJid}\`\n👑 *Admin:* @${callerJid.split('@')[0]}`, mentions: [callerJid] }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ gclone failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .revoke ─────────────────────────────────────────────────────────────────
export async function revokeCommand(sock, chat, msg) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }

  try {
    const code = await sock.groupRevokeInvite(chat);
    const newLink = `https://chat.whatsapp.com/${code}`;
    await sock.sendMessage(chat, { text: `🔄 *Group Invite Link Reset!*\n\nOld link is now revoked.\nNew Link: ${newLink}` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ revoke failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .gshield [on / off] ─────────────────────────────────────────────────────
export async function gshieldCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }

  const arg = (args?.[0] || '').toLowerCase();
  if (arg === 'on') {
    await sock.groupSettingUpdate(chat, 'locked');
    return sock.sendMessage(chat, { text: '🛡️ *Group Shield Activated!*\nOnly admins can edit group info (Name, PFP, Description).' }, { quoted: msg });
  } else if (arg === 'off') {
    await sock.groupSettingUpdate(chat, 'unlocked');
    return sock.sendMessage(chat, { text: '🔓 *Group Shield Deactivated!*\nAll members can edit group info.' }, { quoted: msg });
  }

  return sock.sendMessage(chat, { text: '🛡️ *gshield*\n\nUsage:\n• `.gshield on`\n• `.gshield off`' }, { quoted: msg });
}

// ── .fakereply [@user] [their_text] | [your_reply] ──────────────────────────
export async function fakereplyCommand(sock, chat, msg, args) {
  try {
    const raw = (args || []).join(' ').trim();
    if (!raw.includes('|')) {
      return sock.sendMessage(chat, { text: '🎭 *fakereply*\n\nUsage: `.fakereply @user specified quoted text | your response text`' }, { quoted: msg });
    }

    const [quotedPart, replyPart] = raw.split('|').map(s => s.trim());
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = ctx?.participant || (Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid[0]);

    let targetText = quotedPart;
    if (quotedPart.startsWith('@')) {
      const spaceIdx = quotedPart.indexOf(' ');
      if (spaceIdx !== -1) {
        targetText = quotedPart.slice(spaceIdx + 1).trim();
      }
    }

    if (!targetJid) {
      targetJid = msg.key.participant || msg.key.remoteJid;
    }

    const fakeQuoted = {
      key: {
        remoteJid: chat,
        fromMe: false,
        id: 'FAKE' + Date.now(),
        participant: targetJid
      },
      message: {
        conversation: targetText
      }
    };

    await sock.sendMessage(chat, { text: replyPart }, { quoted: fakeQuoted });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ fakereply failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .antipromote & .antidemote ──────────────────────────────────────────────
export async function antipromoteCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;

  const arg = (args?.[0] || '').toLowerCase();
  if (arg === 'on') {
    setProtRolesConfig(chat, { antipromote: true });
    return sock.sendMessage(chat, { text: '🛡️ *Anti-Promote Enabled!* Any unauthorized promotions will be automatically reverted.' }, { quoted: msg });
  } else if (arg === 'off') {
    setProtRolesConfig(chat, { antipromote: false });
    return sock.sendMessage(chat, { text: '🔓 *Anti-Promote Disabled!*' }, { quoted: msg });
  }

  const cfg = getProtRolesConfig()[chat] || {};
  return sock.sendMessage(chat, { text: `🛡️ *antipromote*\nStatus: *${cfg.antipromote ? 'ON' : 'OFF'}*\n\nUsage:\n• \`.antipromote on\`\n• \`.antipromote off\`` }, { quoted: msg });
}

export async function antidemoteCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (ownerOnly(sock, chat, msg)) return;

  const arg = (args?.[0] || '').toLowerCase();
  if (arg === 'on') {
    setProtRolesConfig(chat, { antidemote: true });
    return sock.sendMessage(chat, { text: '🛡️ *Anti-Demote Enabled!* Any unauthorized demotions will be automatically reverted.' }, { quoted: msg });
  } else if (arg === 'off') {
    setProtRolesConfig(chat, { antidemote: false });
    return sock.sendMessage(chat, { text: '🔓 *Anti-Demote Disabled!*' }, { quoted: msg });
  }

  const cfg = getProtRolesConfig()[chat] || {};
  return sock.sendMessage(chat, { text: `🛡️ *antidemote*\nStatus: *${cfg.antidemote ? 'ON' : 'OFF'}*\n\nUsage:\n• \`.antidemote on\`\n• \`.antidemote off\`` }, { quoted: msg });
}

// ── .purge [count] ──────────────────────────────────────────────────────────
export async function purgeCommand(sock, chat, msg, args) {
  try {
    let count = parseInt(args?.[0] || '10', 10);
    if (isNaN(count) || count < 1) count = 10;
    if (count > 50) count = 50;

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = ctx?.stanzaId || ctx?.quotedMessage?.key?.id;

    let targetMsgIds = [];
    if (quotedMsgId) {
      targetMsgIds.push(quotedMsgId);
    }

    // Attempt to delete calling message
    try {
      await sock.sendMessage(chat, { delete: msg.key });
    } catch {}

    let deleted = 0;
    for (const id of targetMsgIds.slice(0, count)) {
      try {
        await sock.sendMessage(chat, { delete: { remoteJid: chat, fromMe: true, id } });
        deleted++;
      } catch {}
    }

    const report = await sock.sendMessage(chat, { text: `✅ Purge complete. Deleted ${deleted} message(s).` });
    setTimeout(async () => {
      try { await sock.sendMessage(chat, { delete: report.key }); } catch {}
    }, 5000);
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ purge failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .antibot [on / off] ─────────────────────────────────────────────────────
export async function antibotCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }

  const arg = (args?.[0] || '').toLowerCase();
  if (arg === 'on') {
    setAntibotConfig(chat, true);
    return sock.sendMessage(chat, { text: '🤖 *Anti-Bot Shield Enabled!* Unauthorized third-party bot messages will be deleted.' }, { quoted: msg });
  } else if (arg === 'off') {
    setAntibotConfig(chat, false);
    return sock.sendMessage(chat, { text: '🔓 *Anti-Bot Shield Disabled!*' }, { quoted: msg });
  }

  const cfg = getAntibotConfig()[chat];
  return sock.sendMessage(chat, { text: `🤖 *antibot*\nStatus: *${cfg?.enabled ? 'ON' : 'OFF'}*\n\nUsage:\n• \`.antibot on\`\n• \`.antibot off\`` }, { quoted: msg });
}

// ── .warn / .warns / .resetwarns ───────────────────────────────────────────
export async function warnCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }

  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = ctx?.participant || (Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid[0]);

    if (!targetJid && args?.[0]) {
      const raw = args[0].replace(/\D/g, '');
      if (raw.length >= 7) targetJid = `${raw}@s.whatsapp.net`;
    }

    if (!targetJid) {
      return sock.sendMessage(chat, { text: '❌ Target required. Reply to a user or mention @user.' }, { quoted: msg });
    }

    const reason = args.slice(1).join(' ').trim() || 'No reason specified';
    const cfg = getWarnsConfig();
    const current = (cfg[chat]?.[targetJid] || 0) + 1;

    setWarnsConfig(chat, targetJid, current);

    const targetNum = targetJid.split('@')[0];

    if (current >= 3) {
      await sock.sendMessage(chat, {
        text: `⚠️ *3rd Strike Reached for @${targetNum}!*\nReason: ${reason}\n\n🚨 Kicking user from group...`,
        mentions: [targetJid]
      });
      await sock.groupParticipantsUpdate(chat, [targetJid], 'remove').catch(() => {});
      setWarnsConfig(chat, targetJid, 0);
    } else {
      await sock.sendMessage(chat, {
        text: `⚠️ *Warning Issued to @${targetNum}* (${current}/3 strikes)\nReason: _${reason}_\n\n3 strikes will result in an automatic kick.`,
        mentions: [targetJid]
      });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ warn failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function warnsCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = ctx?.participant || (Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid[0]);

    if (!targetJid && args?.[0]) {
      const raw = args[0].replace(/\D/g, '');
      if (raw.length >= 7) targetJid = `${raw}@s.whatsapp.net`;
    }

    if (!targetJid) targetJid = msg.key.participant || msg.key.remoteJid;

    const cfg = getWarnsConfig();
    const count = cfg[chat]?.[targetJid] || 0;
    const targetNum = targetJid.split('@')[0];

    await sock.sendMessage(chat, {
      text: `📋 *Warnings for @${targetNum}:* ${count}/3 strikes`,
      mentions: [targetJid]
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ warns failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function resetwarnsCommand(sock, chat, msg, args) {
  if (!isGroup(chat)) return sock.sendMessage(chat, { text: '❌ Group only.' }, { quoted: msg });
  if (!(await canManageGroup(sock, chat, msg))) {
    return sock.sendMessage(chat, { text: '⛔ Group admins or owner only.' }, { quoted: msg });
  }

  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = ctx?.participant || (Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid[0]);

    if (!targetJid && args?.[0]) {
      const raw = args[0].replace(/\D/g, '');
      if (raw.length >= 7) targetJid = `${raw}@s.whatsapp.net`;
    }

    if (!targetJid) {
      return sock.sendMessage(chat, { text: '❌ Target required. Reply to a user or mention @user.' }, { quoted: msg });
    }

    setWarnsConfig(chat, targetJid, 0);
    const targetNum = targetJid.split('@')[0];

    await sock.sendMessage(chat, {
      text: `✅ Warnings reset for @${targetNum}.`,
      mentions: [targetJid]
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ resetwarns failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export function attachCallRejector(sock) {
  sock.ev.on('call', async (calls) => {
    try {
      const cfg = getCallsConfig();
      if (!cfg.reject) return;
      for (const call of calls) {
        if (call.status === 'offer') {
          await sock.rejectCall(call.id, call.from).catch(() => {});
        }
      }
    } catch (e) { if (process.env.WRAITH_DEBUG === '1') console.log('[call-reject]', e.message); }
  });
}

export async function rejectcallsCommand(sock, chat, msg, args) {
  if (ownerOnly(sock, chat, msg)) return;
  try {
    const a0 = (args?.[0] || '').toLowerCase();
    if (a0 === 'on') { setCallsConfig({ reject: true }); return sock.sendMessage(chat, { text: '📵 Auto-reject calls *enabled*.' }, { quoted: msg }); }
    if (a0 === 'off') { setCallsConfig({ reject: false }); return sock.sendMessage(chat, { text: '📵 Auto-reject calls *disabled*.' }, { quoted: msg }); }
    const cfg = getCallsConfig();
    await sock.sendMessage(chat, { text: `📵 *rejectcalls*\n\nstatus · *${cfg.reject ? 'ON' : 'OFF'}*\n\n\`.rejectcalls on\` / \`.rejectcalls off\`` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ rejectcalls failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
