// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/ytcookies.js
// .ytcookies — YouTube Cookies setup and management
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { sendWithCta } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';
import { isOwner } from '../core/identity.js';

const DATA_ROOT = process.env.MEHTAB_MD_DATA_DIR || process.cwd();
const COOKIES_PATH = path.resolve(DATA_ROOT, 'data', 'youtube_cookies.txt');

export function getCookiesFilePath() {
  if (fs.existsSync(COOKIES_PATH)) {
    const stat = fs.statSync(COOKIES_PATH);
    if (stat.size > 10) return COOKIES_PATH;
  }
  return null;
}

export async function ytcookiesCommand(sock, chat, msg, args) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) {
    return sendWithCta(sock, chat, '⛔ Owner only.', { quoted: msg });
  }

  const p = getPrefix();
  const sub = (args[0] || '').toLowerCase();

  // 1. Clear / Delete cookies
  if (sub === 'clear' || sub === 'del' || sub === 'delete' || sub === 'remove') {
    if (fs.existsSync(COOKIES_PATH)) {
      try {
        fs.unlinkSync(COOKIES_PATH);
        return sendWithCta(sock, chat, `✅ *YouTube cookies cleared successfully!*`, { quoted: msg });
      } catch (e) {
        return sendWithCta(sock, chat, `❌ Failed to clear cookies: ${e.message}`, { quoted: msg });
      }
    } else {
      return sendWithCta(sock, chat, `ℹ️ No saved YouTube cookies file found.`, { quoted: msg });
    }
  }

  // 2. Status check
  if (sub === 'status' || sub === 'check') {
    if (fs.existsSync(COOKIES_PATH)) {
      const stat = fs.statSync(COOKIES_PATH);
      const sizeKb = (stat.size / 1024).toFixed(2);
      const modTime = new Date(stat.mtime).toLocaleString();
      return sendWithCta(sock, chat, `🍪 *YouTube Cookies Status*\n\nStatus: *ACTIVE*\nFile Size: ${sizeKb} KB\nLast Updated: ${modTime}\n\nTo update cookies, reply to a new cookies file or paste new cookies text with \`${p}ytcookies\`.`, { quoted: msg });
    } else {
      return sendWithCta(sock, chat, `🍪 *YouTube Cookies Status*\n\nStatus: *NOT SET*\n\nTo set cookies, type \`${p}ytcookies\` to see the step-by-step guide.`, { quoted: msg });
    }
  }

  // 3. Handle document upload / quoted document
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  const docMsg = msg.message?.documentMessage || quoted?.documentMessage;

  if (docMsg) {
    try {
      fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
      const stream = await downloadContentFromMessage(docMsg, 'document');
      const writeStream = fs.createWriteStream(COOKIES_PATH);
      await pipeline(stream, writeStream);

      const stat = fs.statSync(COOKIES_PATH);
      if (stat.size < 10) {
        fs.unlinkSync(COOKIES_PATH);
        return sendWithCta(sock, chat, `❌ Uploaded file appears empty or invalid.`, { quoted: msg });
      }

      return sendWithCta(sock, chat, `✅ *YouTube Cookies File Saved!*\n\nyt-dlp will now use your custom cookies for YouTube downloads.`, { quoted: msg });
    } catch (err) {
      return sendWithCta(sock, chat, `❌ Failed to process cookies file: ${err.message}`, { quoted: msg });
    }
  }

  // 4. Handle direct text paste: .ytcookies # Netscape HTTP Cookie File...
  const rawText = (args || []).join(' ').trim();
  if (rawText && (rawText.includes('youtube.com') || rawText.includes('# Netscape') || rawText.includes('.google.com'))) {
    try {
      fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
      fs.writeFileSync(COOKIES_PATH, rawText, 'utf-8');
      return sendWithCta(sock, chat, `✅ *YouTube Cookies Text Saved!*\n\nyt-dlp will now use your custom cookies for YouTube downloads.`, { quoted: msg });
    } catch (err) {
      return sendWithCta(sock, chat, `❌ Failed to save cookies text: ${err.message}`, { quoted: msg });
    }
  }

  // 5. Default: Show complete guide
  const guideText = `🍪 *YouTube Cookies Setup Guide*

YouTube frequently blocks bot downloads or demands sign-in. Setting YouTube cookies resolves sign-in requirements, age restrictions, and bot verification blocks.

📌 *Step-by-Step Instructions:*

1️⃣ *Install Browser Extension:*
   Install a Netscape-format cookie exporter on Chrome/Firefox (e.g., *"Get cookies.txt LOCALLY"* extension).

2️⃣ *Export YouTube Cookies:*
   Open youtube.com in your browser while logged in, click the extension icon, and download cookies.txt.

3️⃣ *Set Cookies in Bot:*
   • *Option A:* Reply to the cookies.txt document file on WhatsApp with \`${p}ytcookies\`
   • *Option B:* Send \`${p}ytcookies <pasted contents of cookies.txt>\`

📌 *Other Commands:*
• \`${p}ytcookies status\` — Check active cookies
• \`${p}ytcookies clear\` — Clear stored cookies

Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃`;

  return sendWithCta(sock, chat, guideText, { quoted: msg });
}
