// ─────────────────────────────────────────────
// Al-Jin · modules/dlcap.js
//   .dlcap                → show current download limits
//   .dlcap 500 | 1gb      → set max size of ONE download
//   .dlcap reset          → back to default (500 MB)
//   .dlcap quality 720    → highest video height for YouTube/Facebook (144–2160)
// ─────────────────────────────────────────────
import { isOwner } from '../core/identity.js';
import {
  getMaxDownloadMB, setMaxDownloadMB, parseSizeToMB, getVideoHeight, setVideoHeight,
  getDocThresholdBytes, HARD_MAX_MB, DEFAULT_MAX_MB,
} from '../core/limits.js';
import { getPrefix } from '../core/settings.js';

function statusText() {
  const p = getPrefix();
  return `📥 *Download limits*\n\n` +
    `• Max size per download: *${getMaxDownloadMB()} MB*\n` +
    `• Video quality (max): *${getVideoHeight()}p*\n` +
    `• Sent as document above: *${Math.round(getDocThresholdBytes() / 1048576)} MB*\n\n` +
    `*Change it*\n` +
    `• \`${p}dlcap 1gb\` or \`${p}dlcap 800\` (MB)\n` +
    `• \`${p}dlcap reset\` (default ${DEFAULT_MAX_MB} MB)\n` +
    `• \`${p}dlcap quality 720\`\n\n` +
    `_Highest possible: ${HARD_MAX_MB} MB (WhatsApp's own limit). Keep ~2× the size free on disk, and remember the upload runs at your internet's upload speed._\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`;
}

export async function dlcapCommand(sock, chat, msg, args) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) {
    return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  }
  const a0 = String(args?.[0] || '').toLowerCase();
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });

  if (!a0) return reply(statusText());

  if (a0 === 'reset' || a0 === 'default') {
    setMaxDownloadMB(null);
    return reply(`✅ Download cap reset to *${getMaxDownloadMB()} MB*.`);
  }

  if (a0 === 'quality' || a0 === 'q' || a0 === 'height') {
    const raw = String(args?.[1] || '').toLowerCase().replace(/p$/, '');
    if (raw === 'reset' || raw === 'default') {
      setVideoHeight(0);
      return reply(`✅ Video quality reset to *${getVideoHeight()}p*.`);
    }
    const h = parseInt(raw, 10);
    if (!h || h < 144 || h > 2160) return reply('❌ Use a height between 144 and 2160, e.g. `.dlcap quality 720`');
    setVideoHeight(h);
    return reply(`✅ Max video quality is now *${getVideoHeight()}p*.\n_Higher quality = bigger files; raise \`.dlcap\` too if downloads get refused._`);
  }

  const mb = parseSizeToMB(args.join(' '));
  if (!mb) return reply('❌ Try `.dlcap 500`, `.dlcap 1gb`, `.dlcap reset` or `.dlcap quality 720`');
  if (mb < 5) return reply('❌ Minimum is 5 MB.');
  const capped = mb > HARD_MAX_MB;
  const now = setMaxDownloadMB(mb);
  let text = `✅ Max download size is now *${now} MB*.`;
  if (capped) text += `\n⚠️ ${Math.round(mb)} MB is above WhatsApp's ${HARD_MAX_MB} MB file limit, so I used ${HARD_MAX_MB}.`;
  if (now > 500) text += `\n\n_Big files need free disk space (about 2× the file) and a good upload speed. Files over ${Math.round(getDocThresholdBytes() / 1048576)} MB are sent as documents._`;
  return reply(text);
}
