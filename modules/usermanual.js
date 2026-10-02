// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/usermanual.js
// Dynamic PDF downloader for official bot user manual
// ─────────────────────────────────────────────
import { fetchBuffer } from '../lib/net.js';

const MANUAL_URL = 'https://raw.githubusercontent.com/themalik-g/mehtab_md_manual/main/mehtab_md_manual.pdf';

export async function usermanualCommand(sock, chat, msg) {
  const statusMsg = await sock.sendMessage(chat, {
    text: '📄 *Fetching 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 User Manual PDF…*'
  }, { quoted: msg });

  try {
    const pdfBuffer = await fetchBuffer(MANUAL_URL, { timeout: 20000, maxBytes: 50 * 1024 * 1024 });

    if (!pdfBuffer || pdfBuffer.length < 1024) {
      throw new Error('Downloaded PDF manual is empty or invalid.');
    }

    await sock.sendMessage(
      chat,
      {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: 'mehtab_md_manual.pdf',
        caption: '📄 *𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 Bot — Official User Manual*\n\nDownloaded from: `https://github.com/themalik-g/mehtab-md_manual.git`\n\nProvided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃',
      },
      { quoted: msg }
    );

    await sock.sendMessage(chat, {
      text: '✅ *User Manual sent successfully!*',
      edit: statusMsg.key
    }).catch(() => {});

  } catch (e) {
    console.error('[usermanualCommand]', e);
    const errText = `⚠️ *Failed to download user manual:* ${e.message}`;
    await sock.sendMessage(chat, {
      text: errText,
      edit: statusMsg.key
    }).catch(() => {
      sock.sendMessage(chat, { text: errText }, { quoted: msg }).catch(() => {});
    });
  }
}
