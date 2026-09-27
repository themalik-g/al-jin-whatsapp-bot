// ─────────────────────────────────────────────
// WRAITH · modules/details.js
// .details <command> — Explains how a command works and how to use it
// .details all — Summarizes details for all commands
// ─────────────────────────────────────────────
import { sendWithCta } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';

const COMMAND_DETAILS = {
  ghost: {
    title: '👻 Ghost Mode (Antidelete & Antiedit)',
    description: 'Silently captures deleted and edited messages, media, and view-once messages. Saved content is sent directly to your owner chat.',
    usage: [
      '.ghost — Show current status and menu',
      '.ghost on | off — Toggle antidelete watcher',
      '.ghost edit on | off — Toggle antiedit watcher',
      'Replying 1 or 2 to the ghost menu toggles options directly',
    ],
    notes: 'Ghost ignores messages sent by yourself and handles bounded memory queues.',
  },
  lurk: {
    title: '🌒 Lurk Mode (Status Watcher)',
    description: 'Automatically views, reacts to, and downloads status updates without marking them as seen.',
    usage: [
      '.lurk — View status watcher menu',
      '.lurk on | off — Toggle status auto-view',
      '.lurk react on | off — Toggle status auto-reaction',
      '.lurk download on | off — Toggle background status media download',
      '.lurk emoji <emoji | random | none> — Set reaction emoji',
      'Replying 1, 2, or 3 to lurk menu toggles auto-view, react, or download',
    ],
  },
  peek: {
    title: '👁️ Peek Mode (View-Once Revealer)',
    description: 'Reveals view-once images, videos, and audio messages in direct chats or from quoted message replies.',
    usage: [
      '.peek — View peek settings',
      '.peek auto on | off — Toggle automatic view-once capture',
      '.peek watch on | off — Toggle quoted view-once watcher',
      '.peek dest <owner | same | both> — Set reveal destination',
      'Reply to any view-once with .peek to reveal it manually',
    ],
  },
  play: {
    title: '🎵 Play Command',
    description: 'Searches YouTube / SoundCloud for music audio and delivers MP3 audio directly in chat.',
    usage: ['.play <song title or YouTube URL>'],
  },
  ytv: {
    title: '🎬 YTV / Video Command',
    description: 'Downloads YouTube videos and optimizes them to WhatsApp playable MP4 video.',
    usage: [
      '.ytv <video title or URL>',
      '.video <video title or URL>',
    ],
  },
  gemini: {
    title: '🤖 Gemini AI Assistant',
    description: 'Generates AI text answers directly using Google Gemini models (gemini-3.5-flash-lite, fallback to gemini-3.8-flash).',
    usage: [
      '.gemini <question or prompt>',
      'Reply to any message with .gemini <question> to analyze or summarize quoted text',
    ],
  },
  ppt: {
    title: '📊 PPT Generator',
    description: 'Creates professional PowerPoint (.pptx) presentations using AI slide structuring and pptxgenjs rendering.',
    usage: ['.ppt <topic or outline>'],
  },
  book: {
    title: '📚 Book Search & Downloader',
    description: 'Searches multi-tier book repositories (Internet Archive, Gutendex, Open Library) and downloads PDF/EPUB books.',
    usage: [
      '.book <title or author> — Search books',
      '.book dl <number> — Download specific search result',
    ],
  },
  settings: {
    title: '⚙️ Settings Command',
    description: 'Displays current operational status across all system modes and feature toggles in a single overview.',
    usage: ['.settings'],
  },
  forward: {
    title: '⏩ Forward Command',
    description: 'Forwards text messages, media, or quoted messages to target JID, LID, or phone number.',
    usage: [
      '.forward <text> <JID / Phone>',
      'Reply to text or media with .forward <JID / Phone>',
      'Reply to text or media with .forward <custom caption> <JID / Phone>',
    ],
  },
  pdd: {
    title: '🛡️ Promote / Demote Detection (PDD)',
    description: 'Monitors group participant admin updates and sends alerts when admin status changes.',
    usage: ['.pdd on | off'],
  },
  presence: {
    title: '🟢 Presence Settings',
    description: 'Controls online status, auto-typing, auto-recording, and read receipts.',
    usage: [
      '.presence — View current presence settings',
      '.presence alwaysonline on | off',
      '.presence autotyping on | off',
      '.presence autorecording on | off',
      '.presence readreceipts on | off',
    ],
  },
  disappearing: {
    title: '⏱️ Disappearing Messages',
    description: 'Sets disappearing message timer for current chat.',
    usage: [
      '.disappearing 0s — Turn off',
      '.disappearing 24h — Set to 24 hours',
      '.disappearing 7d — Set to 7 days',
      '.disappearing 90d — Set to 90 days',
    ],
  },
};

export async function detailsCommand(sock, chat, msg, args) {
  const p = getPrefix();
  const query = (args || []).join(' ').toLowerCase().trim();

  if (!query || query === 'all') {
    let listText = `📘 *WRAITH Command Details Index*\n\n`;
    listText += `Use \`${p}details <command>\` for detailed instructions on a specific command.\n\n`;

    for (const [cmd, data] of Object.entries(COMMAND_DETAILS)) {
      listText += `• *${p}${cmd}* — ${data.title}\n`;
    }

    listText += `\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`;
    return sendWithCta(sock, chat, listText, { quoted: msg });
  }

  const detailKey = query.replace(/^[\.\/]/, '');
  const data = COMMAND_DETAILS[detailKey];

  if (!data) {
    return sendWithCta(sock, chat, `❓ *No details found for '${query}'*\n\nType \`${p}details all\` to view details for all available commands.`, { quoted: msg });
  }

  let text = `${data.title}\n\n`;
  text += `📝 *Description:*\n${data.description}\n\n`;
  text += `💡 *Usage & Examples:*\n`;
  for (const u of data.usage) {
    text += `• \`${u}\` \n`;
  }

  if (data.notes) {
    text += `\n📌 *Note:* ${data.notes}\n`;
  }

  text += `\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`;
  return sendWithCta(sock, chat, text, { quoted: msg });
}
