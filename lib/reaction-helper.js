// ─────────────────────────────────────────────
// Al-Jin · lib/reaction-helper.js
// Emoji reaction & progress status helper
// ─────────────────────────────────────────────

export const EMOJIS = {
  INITIAL: '🧞‍♂️',
  SUCCESS: '☑',
  FAILED: '❌',
  WAITING: '⏳',
  SEARCH: '🔍',
  DOWNLOAD: '📥',
  UPLOAD: '📤',
  PLAY: '🎵',
  PHOTO: '📸',
  MOVIE: '🎥',
};

const CATEGORY_MAP = {
  PLAY: new Set([
    'play', 'mp3', 'songinfo', 'lyrics', 'tts', 'waveform', '8d', 'bassboost',
    'robot', 'vocal', 'vn', 'tomp3', 'audio'
  ]),
  PHOTO: new Set([
    'image', 'img', 'photo', 'imagine', 'imagen', 'getpp', 'setpp', 'setgpp',
    'couplepp', 'wp', 'dp', 'hddp', 'fulldp', 'sticker', 's', 'toimg', 'web2img',
    'webss', 'ocr', 'readtext', 'barcode', 'qr', 'jinimage', 'photocommand'
  ]),
  MOVIE: new Set([
    'movie', 'video', 'ytv', 'tovid', 'whatanime', 'jinvideo'
  ]),
  SEARCH: new Set([
    'search', 'wiki', 'wikipedia', 'urban', 'slang', 'gali', 'igsearch',
    'jinytsearch', 'quransearch', 'qs', 'hadeessearch', 'hs', 'islamsearch',
    'is', 'npm', 'stalk', 'details', 'settings', 'pwned', 'channelinfo',
    'commandcount', 'chatstats', 'blocklist', 'ownerlist', 'getstatus',
    'getvar', 'usermanual', 'google', 'find', 'igprofile', 'mobileinfo',
    'laptopinfo'
  ]),
  UPLOAD: new Set([
    'url'
  ]),
  DOWNLOAD: new Set([
    'dl', 'download', 'ytdl', 'pdl', 'pdlzip', 'postdl', 'twitter', 'tw',
    'pinterest', 'pin', 'threads', 'reddit', 'youtube', 'yt', 'gitdl', 'mfdl',
    'ig', 'tiktok', 'fb', 'igpost', 'tiktokpost', 'fbpost', 'apk', 'betaapk',
    'jinapk', 'jindl', 'book', 'books', 'igzip', 'igstory'
  ])
};

export function getCommandCategoryEmoji(verb) {
  if (!verb) return EMOJIS.WAITING;
  const v = verb.toLowerCase().trim();

  if (CATEGORY_MAP.PLAY.has(v)) return EMOJIS.PLAY;
  if (CATEGORY_MAP.PHOTO.has(v)) return EMOJIS.PHOTO;
  if (CATEGORY_MAP.MOVIE.has(v)) return EMOJIS.MOVIE;
  if (CATEGORY_MAP.SEARCH.has(v)) return EMOJIS.SEARCH;
  if (CATEGORY_MAP.UPLOAD.has(v)) return EMOJIS.UPLOAD;
  if (CATEGORY_MAP.DOWNLOAD.has(v)) return EMOJIS.DOWNLOAD;

  return EMOJIS.WAITING;
}

export async function reactMsg(sock, chat, key, emoji) {
  if (!sock || !chat || !key || !emoji) return;
  try {
    await sock.sendMessage(chat, { react: { text: emoji, key } });
  } catch (e) {
    // Ignore reaction errors if message deleted or unsupported
  }
}

export async function editStatus(sock, chat, statusKey, text) {
  if (!sock || !chat || !statusKey || text === undefined) return;
  try {
    const key = typeof statusKey === 'object' && statusKey.key ? statusKey.key : statusKey;
    await sock.sendMessage(chat, { text, edit: key });
  } catch (e) {
    // Ignore edit errors
  }
}
