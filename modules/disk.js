// ─────────────────────────────────────────────
// Al-Jin · modules/disk.js  (owner only)
//   .disk                  → free space the bot sees + current settings
//   .disk tmp auto         → temp files go on the roomiest disk (default)
//   .disk tmp system       → use the OS /tmp
//   .disk tmp /some/folder → use that folder
//   .disk reserve 100      → always keep this much free (MB, default 150)
//   .disk limit 3gb        → never use more than this for ONE send
//   .disk room 3gb         → allot: treat this much as free (when the OS reports it wrongly)
//   .disk room auto        → measure again
//   .disk reset            → all of the above back to default
// ─────────────────────────────────────────────
import os from 'node:os';
import { isOwner } from '../core/identity.js';
import { getPrefix, getSetting, setSetting } from '../core/settings.js';
import { parseSizeToMB, getMaxDownloadMB, fmtMB } from '../core/limits.js';
import { diskInfo } from '../lib/stream-send.js';

const MB = 1024 * 1024;
const f = (b) => (b == null ? 'unknown' : b === Infinity ? 'no limit' : b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(2)} GB` : `${fmtMB(b)} MB`);

async function status() {
  const p = getPrefix(); const i = await diskInfo();
  return `💾 *Disk & memory*\n\n` +
    `• Temp folder: \`${i.dir}\` (${i.want})\n` +
    `• Free there: *${f(i.tmpAvail)}*\n` +
    `• Free in bot folder: *${f(i.here)}*\n` +
    `• Reserve kept free: *${f(i.reserve)}*\n` +
    `${i.limit ? `• Limit per send: *${f(i.limit)}*\n` : ''}${i.manual ? `• Allotted (manual): *${f(i.manual)}*\n` : ''}` +
    `• ➜ Room for one file now: *${f(i.room)}* (also capped by .dlcap = ${getMaxDownloadMB()} MB)\n` +
    `• RAM: ${f(os.freemem())} free of ${f(os.totalmem())}\n\n` +
    `*Change*\n• \`${p}disk tmp auto|system|/folder\`\n• \`${p}disk reserve 100\`\n• \`${p}disk limit 3gb\`\n• \`${p}disk room 3gb\` (allot) · \`${p}disk room auto\`\n• \`${p}disk reset\`\n\n_A file needs about its own size free once (WhatsApp keeps one encrypted temp copy while uploading)._\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
}

export async function diskCommand(sock, chat, msg, args = []) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
  const a0 = String(args[0] || '').toLowerCase();
  const rest = args.slice(1).join(' ').trim();
  if (!a0) return reply(await status());

  if (a0 === 'reset') {
    for (const k of ['tmpDir', 'diskReserveMB', 'diskLimitMB', 'diskRoomMB']) setSetting(k, 0);
    setSetting('tmpDir', 'auto');
    return reply(`✅ Disk settings back to default.\n\n${await status()}`);
  }
  if (a0 === 'tmp') {
    if (!rest) return reply('Use `.disk tmp auto`, `.disk tmp system` or `.disk tmp /path/to/folder`');
    setSetting('tmpDir', /^(auto|system)$/i.test(rest) ? rest.toLowerCase() : rest);
    return reply(`✅ Temp folder mode: *${rest}*\n\n${await status()}`);
  }
  if (a0 === 'room' && /^(auto|reset|off)$/i.test(rest)) { setSetting('diskRoomMB', 0); return reply(`✅ Measuring free space again.\n\n${await status()}`); }
  if (['reserve', 'limit', 'room'].includes(a0)) {
    const mb = parseSizeToMB(rest);
    if (mb === null || (mb < 0) || (a0 !== 'reserve' && mb < 20)) return reply(`❌ Give a size, e.g. \`.disk ${a0} ${a0 === 'reserve' ? '100' : '3gb'}\``);
    setSetting({ reserve: 'diskReserveMB', limit: 'diskLimitMB', room: 'diskRoomMB' }[a0], Math.round(mb));
    const warn = a0 === 'room' ? '\n⚠️ _I now trust this number instead of measuring. If the disk really has less, the send fails._' : '';
    return reply(`✅ ${a0} = *${Math.round(mb)} MB*${warn}\n\n${await status()}`);
  }
  return reply(await status());
}
