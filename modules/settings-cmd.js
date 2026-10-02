// ─────────────────────────────────────────────
// Al-Jin · modules/settings-cmd.js
// .settings — Shows current status of all features & modes
// ─────────────────────────────────────────────
import fs from 'fs';
import { inState } from '../core/paths.js';
import { getPrefix, getReplyMode } from '../core/settings.js';
import { sendWithCta } from '../lib/buttons.js';

function safeReadJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return fallback;
}

export async function settingsCommand(sock, chat, msg) {
  const ghostState = safeReadJson(inState('ghost.json'), { on: true, edit: true });
  const lurkState = safeReadJson(inState('lurk.json'), { on: true, react: true, emoji: '❤️', download: true });
  const peekState = safeReadJson(inState('peek.json'), { auto: false, dest: 'owner', watchQuoted: true });
  const presenceState = safeReadJson(inState('presence.json'), { alwaysOnline: false, autoTyping: false, autoRecording: false, readReceipts: false });
  const protectionState = safeReadJson(inState('protection.json'), { antilink: false, antispam: false, antisticker: false });
  const pddState = safeReadJson(inState('pdd.json'), {});

  const isGroup = chat.endsWith('@g.us');
  const groupPdd = isGroup ? (pddState[chat] !== false) : null;

  const prefix = getPrefix();
  const replyMode = getReplyMode();

  let text = `⚙️ *Al-Jin System Settings & Modes*\n\n`;

  text += `👻 *Ghost Mode*\n`;
  text += `• Antidelete: *${ghostState.on !== false ? 'ON' : 'OFF'}*\n`;
  text += `• Antiedit: *${ghostState.edit !== false ? 'ON' : 'OFF'}*\n\n`;

  text += `🌒 *Lurk Mode*\n`;
  text += `• Auto-View: *${lurkState.on !== false ? 'ON' : 'OFF'}*\n`;
  text += `• Auto-React: *${lurkState.react !== false ? 'ON' : 'OFF'}* (${lurkState.emoji || '❤️'})\n`;
  text += `• Download Statuses: *${lurkState.download !== false ? 'ON' : 'OFF'}*\n\n`;

  text += `👁️ *Peek Mode*\n`;
  text += `• Auto-Peek: *${peekState.auto ? 'ON' : 'OFF'}*\n`;
  text += `• Quoted Watcher: *${peekState.watchQuoted !== false ? 'ON' : 'OFF'}*\n`;
  text += `• Destination: *${peekState.dest || 'owner'}*\n\n`;

  text += `🟢 *Presence*\n`;
  text += `• Always Online: *${presenceState.alwaysOnline ? 'ON' : 'OFF'}*\n`;
  text += `• Auto Typing: *${presenceState.autoTyping ? 'ON' : 'OFF'}*\n`;
  text += `• Auto Recording: *${presenceState.autoRecording ? 'ON' : 'OFF'}*\n`;
  text += `• Read Receipts: *${presenceState.readReceipts ? 'ON' : 'OFF'}*\n\n`;

  text += `🛡️ *Protection*\n`;
  text += `• Anti-Link: *${protectionState.antilink ? 'ON' : 'OFF'}*\n`;
  text += `• Anti-Spam: *${protectionState.antispam ? 'ON' : 'OFF'}*\n`;
  text += `• Anti-Sticker: *${protectionState.antisticker ? 'ON' : 'OFF'}*\n`;

  if (isGroup) {
    text += `• Promote/Demote Alert (PDD): *${groupPdd ? 'ON' : 'OFF'}*\n`;
  }

  text += `\n🔧 *Configuration*\n`;
  text += `• Prefix: \`${prefix}\` \n`;
  text += `• Reply Mode: *${replyMode}*\n\n`;

  text += `Provided by 𝐀𝐥-𝐉𝐢𝐧`;

  return sendWithCta(sock, chat, text, { quoted: msg });
}
