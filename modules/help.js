// ─────────────────────────────────────────────
// Al-Jin · modules/help.js
// Clean single-message plain text list menu with box layout
// ─────────────────────────────────────────────
import { isOwner } from '../core/identity.js';
import { getPrefix, getSetting, setSetting } from '../core/settings.js';
import { newsletterContext, sendWithCta } from '../lib/buttons.js';
import { businessStatusQuote } from '../lib/fakequote.js';
import { X_MENU } from './x-details.js';
import { readJson } from '../core/state-io.js';
import { inState } from '../core/paths.js';

const MENU_IMAGE = process.env.WRAITH_MENU_IMAGE || 'https://i.picrd.com/images/YZUezOztDow.jpg';
// .imenu on      (default) → ONE message: banner image, whole menu as its caption
// .imenu off               → ONE plain text message
// .imenu preview           → ONE text message with the banner as a large preview card
// Never split into two messages. If the image can't be used, the same text goes out alone.
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbDSqdOFy72BrpK1I40c';

// .imenu card → small link card (title + "Modules: N | Mode: X" + url). Tap opens the url set with `.imenu card <url>`.
// Built-in 128x128 JPEG (link icon) used as the card thumbnail
const CARD_THUMB_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCACAAIADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxmiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKns7C91GYw2NpPdSKu4pBGXYDpnA7cj86AIKK6j/hWni/8A6BH/AJMxf/FUf8K08X/9Aj/yZi/+KoA5eiuo/wCFaeL/APoEf+TMX/xVYepaNqWjzeVqNjPasWZVMiEK5XrtPRhyORkcigCnRU9nYXuozGGxtJ7qRV3FIIy7AdM4HbkfnXQ/8K08X/8AQI/8mYv/AIqgDl6K6j/hWni//oEf+TMX/wAVR/wrTxf/ANAj/wAmYv8A4qgDl6Kualo2paPN5Wo2M9qxZlUyIQrleu09GHI5GRyKp0AFFFFABRRRQBs+F/C994p1MWloNkSYM9wwysS/1J5wO/sASPeNJ0nTfDGjC1tQtvbQKXklkYAscfM7t68cnoAOwAFc38KNNjs/B63g2tJfSvIzBMMApKBSe4G0n/gR/Hlviv4nuptVbw9BI0dpbqjTqBjzXIDDJzyoBXjjnPXAw9hHcy/EbwlDM8TawpZGKkpDIy5HoQpBHuOKZ/wsvwh/0F//ACWl/wDia8FoouFj3r/hZfhD/oL/APktL/8AE1uSx6b4g0p4mMF9Y3KlSUcOjgHsR3BHUcgj1FeTeGvhh/wkWgW2q/2x9n+0b/3X2bft2uV67xnpnpXo/g7wv/wieky2H2z7X5k5m3+VsxlVGMZP939aYi7pOk6b4Y0YWtqFt7aBS8ksjAFjj5ndvXjk9AB2AArLl+I3hKGZ4m1hSyMVJSGRlyPQhSCPccVo+JdF/wCEi0C50r7R9n+0bP3uzft2uG6ZGemOtecap8I/7N0m8v8A+3PN+ywPNs+yY3bVJxnfx0oA7P8A4WX4Q/6C/wD5LS//ABNH/Cy/CH/QX/8AJaX/AOJrwWilcdj6Wlj03xBpTxMYL6xuVKko4dHAPYjuCOo5BHqK8P8AGngu68KXu5S0+nTNiCcjkH+4/o36EcjuBa+HHie60bxBb6eZGexv5RG8WM7Xb5VccjBzgH1HYkDHqXjzTY9U8GalG+0NBEbhHZNxUp83HoSAVz6MfpRuGx8+0UUUhhRRRQB7l8LLyO68D28KKwa0lkicsOCS2/j2w4/HNcP8V9DurPxK2r7Ge0vlQCQL8qOqhdhOeuFB5xnJx0NZHgrxfN4S1NpDH51nc7VuYwBuwM4ZT6jJ46HJHoR7j/xK/E2if8sr3T7yP8GH8wQR7EEdiKe4tj5ror2iX4QeHJJndbjUIlZiRGkqbVHoMqTge5Jpv/CnfD3/AD+an/39j/8AiKLBcxfCHxJ0bQPDFppd3bXzzQb9zRRoVOXZhjLA9CO1egeGvEtl4p06S+sYp4445TEROoDZAB7E8fMK5n/hTvh7/n81P/v7H/8AEV12n6ZpfhzTGgsoYrO0i3SOS3A7lmZjnoOpPQDsKYg1zWLfQNHn1S7SV4YNu5YgCxywUYyQOpHeuE1n4q6FqOh39jDaagslzbSRIXjQKCykDOH6c13f/Er8TaJ/yyvdPvI/wYfzBBHsQR2Irk5fhB4ckmd1uNQiVmJEaSptUegypOB7kmgDxeivZv8AhTvh7/n81P8A7+x//EUf8Kd8Pf8AP5qf/f2P/wCIpWHc8/8Ah/od1rHiuzkhRhBZSpcTyhcqgU7lB5HLEY9epwcGvYfGt5HY+DNWmlVirWzRAKOcv8g/DLDPtV3T9M0vw5pjQWUMVnaRbpHJbgdyzMxz0HUnoB2FePfEDxx/wk1wtjYjbptvJuRmXDTOARv55AwTge+T6A2Dc4yiiikMKKKKACtTR/E2taBuGl6hLbo+d0fDIScc7WBGeBzjNZdFAHe/8Li8Q/8APnpn/fqT/wCLo/4XF4h/589M/wC/Un/xdcFRRcLHe/8AC4vEP/Pnpn/fqT/4uue1zxlr3iBWiv79vs7MT9niASPBIIBA+8BgY3ZIxWHRQBqaP4m1rQNw0vUJbdHzuj4ZCTjnawIzwOcZrqf+FxeIf+fPTP8Av1J/8XXBUUAd7/wuLxD/AM+emf8AfqT/AOLo/wCFxeIf+fPTP+/Un/xdcFRRcLG5rnjLXvECtFf37fZ2Yn7PEAkeCQQCB94DAxuyRisOiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==';

export function imenuCardUrl() {
  return getSetting('imenuCardUrl') || CHANNEL_LINK;
}

export function imenuMode() {
  const v = getSetting('imenu');
  if (v === 'off' || v === false) return 'off';
  if (v === 'preview') return 'preview';
  if (v === 'card') return 'card';
  return 'on';                                          // default keeps the banner image the main bot always had
}

// Blue-tick "WhatsApp Business" status quote on the menu. Default ON; `.imenu quote off` disables it.
export function menuQuoteOn() {
  const v = getSetting('imenuQuote');
  return !(v === false || v === 'off');
}

// Real pixel size of a JPEG (so the preview card is sized correctly)
function jpegSize(buf) {
  try {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch {}
  return null;
}

let _thumb = null;
async function menuThumb() {
  if (_thumb) return _thumb;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(MENU_IMAGE, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    _thumb = Buffer.from(await res.arrayBuffer());
    return _thumb;
  } catch { return null; }
}

// ── Link card sender ─────────────────────────────────────────
// Method 1: extendedTextMessage + uploaded 'thumbnail-link' image (what current WhatsApp expects)
// Method 2: same message without the uploaded image (small inline JPEG only)
// Method 3: Baileys' own `linkPreview` option
async function sendLinkCard(sock, chat, { text, url, title, description, mentions = [], quoted, thumbBuf }) {
  const fullText = text.includes(url) ? text : `${text}\n\n${url}`;   // url MUST be inside the text
  const thumb = thumbBuf || Buffer.from(CARD_THUMB_B64, 'base64');
  const dims = jpegSize(thumb);
  const log = (m, e) => { try { console.error(`[menu:card] ${m}:`, e?.message || e); } catch {} };
  let bw;
  try { bw = await import('@whiskeysockets/baileys'); } catch (e) { log('baileys import', e); }

  const build = (extra = {}) => ({
    extendedTextMessage: {
      text: fullText, matchedText: url, canonicalUrl: url, title, description,
      previewType: 0, jpegThumbnail: thumb,
      contextInfo: mentions.length ? { mentionedJid: mentions } : {},
      ...extra,
    },
  });
  const relay = async (content) => {
    const wa = bw.generateWAMessageFromContent(chat, content, { userJid: sock.user?.id, quoted });
    await sock.relayMessage(chat, wa.message, { messageId: wa.key.id });
    return wa;
  };

  if (bw) {
    try {   // Method 1
      const media = await bw.prepareWAMessageMedia({ image: thumb }, { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' });
      // (no externalAdReply / alwaysShowAdAttribution anywhere: consumer WhatsApp drops those from non-business senders)
      const t = media.imageMessage || {};
      const sentWa = await relay(build({
        thumbnailDirectPath: t.directPath, thumbnailSha256: t.fileSha256, thumbnailEncSha256: t.fileEncSha256,
        mediaKey: t.mediaKey, mediaKeyTimestamp: t.mediaKeyTimestamp,
        thumbnailHeight: dims?.height || t.height || 128, thumbnailWidth: dims?.width || t.width || 128,
      }));
      console.error('[menu:card] sent via method 1');
      return sentWa;
    } catch (e) { log('method 1 (uploaded thumbnail) failed', e); }
    try {   // Method 1b: Baileys linkPreview + highQualityThumbnail (violetix-style), no ad fields at all
      const m = await bw.prepareWAMessageMedia({ image: thumb }, { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' });
      const image = m.imageMessage || {};
      if (dims) { image.height = dims.height; image.width = dims.width; }
      const wa = await sock.sendMessage(chat, {
        text: fullText, mentions, channelCtx: false,
        linkPreview: { 'matched-text': url, 'canonical-url': url, title, description, previewType: 0, jpegThumbnail: thumb, highQualityThumbnail: image },
      }, { quoted });
      console.error('[menu:card] sent via method 1b');
      return wa;
    } catch (e) { log('method 1b (linkPreview+HQ thumbnail) failed', e); }
    try { return await relay(build()); }   // Method 2
    catch (e) { log('method 2 (inline thumbnail) failed', e); }
  }
  try {   // Method 3
    return await sock.sendMessage(chat, {
      text: fullText, mentions,
      linkPreview: { 'matched-text': url, 'canonical-url': url, title, description, jpegThumbnail: thumb },
    }, { quoted });
  } catch (e) { log('method 3 (linkPreview) failed', e); }
  return null;   // caller falls back to the normal text menu
}

// WhatsApp silently drops messages carrying ad-attribution fields from non-business senders.
function scrubAds(c) {
  if (c && typeof c === 'object') { delete c.externalAdReply; delete c.alwaysShowAdAttribution; }
  return c;
}

async function sendMenu(sock, chat, text, msg, mentions = []) {
  // Whole menu is a reply to the blue-tick "WhatsApp Business" status (.imenu quote off to disable).
  const quoted = menuQuoteOn() ? businessStatusQuote() : msg;
  const ctx = (extra = {}) => scrubAds(newsletterContext({ ...(mentions.length ? { mentionedJid: mentions } : {}), ...extra }));
  const mode = imenuMode();

  if (mode === 'on') {
    // Banner image + whole menu in ONE message, sent as a real link preview (uploaded 'thumbnail-link'
    // image). A plain image-with-caption menu is what normal WhatsApp accounts were dropping.
    try {
      const thumbBuf = await menuThumb();
      if (thumbBuf) {
        const sent = await sendLinkCard(sock, chat, {
          text, mentions, quoted, thumbBuf,
          url: CHANNEL_LINK, title: '𝗔𝗟-𝗝𝗜𝗡', description: 'Al-Jin Official Channel',
        });
        if (sent) return sent;
      }
    } catch (e) { try { console.error('[menu:on]', e?.message); } catch {} }
    if (text.length <= 1000) {
      try {
        return await sock.sendMessage(chat, { image: { url: MENU_IMAGE }, caption: text, mentions, contextInfo: ctx() }, { quoted });
      } catch (e) { try { console.error('[menu:image]', e?.message); } catch {} }
    }
  }

  if (mode === 'card') {
    // Real WhatsApp link preview (never externalAdReply). Tries 3 methods and logs which one worked.
    const modules = REGISTRY.reduce((n, g) => n + g.commands.length, 0);
    const ownerMode = readJson(inState('mode.json'), { mode: 'private' }).mode === 'public' ? 'public' : 'owner';
    const sent = await sendLinkCard(sock, chat, {
      text, mentions, quoted,
      url: imenuCardUrl(),
      title: getSetting('imenuCardTitle') || '𝗔𝗟-𝗝𝗜𝗡',
      description: `Modules: ${modules} | Mode: ${String(ownerMode).toUpperCase()}`,
    });
    if (sent) return sent;
  }

  if (mode === 'preview') {
    // Banner as a large preview card, built as a real link preview (extendedTextMessage + uploaded
    // 'thumbnail-link' image). The old externalAdReply card is silently dropped on normal WhatsApp.
    try {
      const thumbBuf = await menuThumb();
      if (thumbBuf) {
        const sent = await sendLinkCard(sock, chat, {
          text, mentions, quoted, thumbBuf,
          url: CHANNEL_LINK, title: '𝗔𝗟-𝗝𝗜𝗡', description: 'Al-Jin Official Channel',
        });
        if (sent) return sent;
      }
    } catch (e) { try { console.error('[menu:preview]', e?.message); } catch {} }
  }

  try {
    return await sock.sendMessage(chat, { text, mentions, contextInfo: ctx() }, { quoted });
  } catch (e) {
    try { console.error('[menu:text]', e?.message); } catch {}
    return sendWithCta(sock, chat, text, { quoted: msg });
  }
}

const c = (cmd, ownerOnly = false) => ({ cmd, ownerOnly });

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ꞯ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

function toSmallCaps(str) {
  return str.toLowerCase().split('').map((ch) => SMALL_CAPS[ch] || ch).join('');
}

export const REGISTRY = [
  {
    id: 'core',
    icon: '🛡️',
    title: 'CORE',
    commands: [
      c('.alive'),
      c('.ping'),
      c('.uptime'),
      c('.restart', true),
      c('.imenu <on|off|preview|card|quote> [url]', true),
      c('.cpu', true),
      c('.gpu', true),
      c('.ram', true),
      c('.rom', true),
      c('.cpulimit <0.30|30%|auto|off>', true),
      c('.ramlimit <mb|off> [restart]', true),
      c('.help'),
      c('.menu'),
      c('.usermanual'),
      c('.prefix', true),
      c('.mode', true),
      c('.replymode <text|poll|list|buttons>', true),
      c('.update', true),
      c('.script'),
      c('.repo'),
      c('.owner'),
    ],
  },
  {
    id: 'ai2',
    icon: '🧞',
    title: 'JIN AI & ESM',
    commands: [
      c('.jin <q>'), c('.jin2 <q>'), c('.jin create <prompt>'), c('.jincreate2 <prompt>'),
      c('.gpt <q>'), c('.claude <q>'), c('.grok <q>'), c('.deepseek <q>'), c('.kimi <q>'),
      c('.jindl <url>'), c('.jinvideo <url/query>'), c('.jinytsearch <query>'),
      c('.jinimage <prompt>'), c('.jinai <prompt>'), c('.jinapk <app>'),
      c('.gpt models'), c('.gpt use <id>', true),
    ],
  },
  {
    id: 'apps',
    icon: '📦',
    title: 'APPS & DEVICES',
    commands: [
      c('.apk <app>'), c('.betaapk <app>'),
      c('.mobileinfo <phone>'), c('.laptopinfo <laptop>'),
    ],
  },
  {
    id: 'igplus',
    icon: '📸',
    title: 'INSTAGRAM+',
    commands: [
      c('.igzip <user>', true), c('.igstory <user>', true),
      c('.igsearch <name>', true), c('.igprofile <user>', true),
      c('.fb <url>'),
    ],
  },
  {
    id: 'tagplus',
    icon: '🏷️',
    title: 'TAG (NO ADMINS)',
    commands: [c('.tagallnoadmin [text]', true), c('.hidetagnoadmin [text]', true)],
  },
  {
    id: 'ghost',
    icon: '🎭',
    title: 'GHOST',
    commands: [
      c('.ghost', true),
      c('.ghost on', true),
      c('.ghost off', true),
      c('.ghost edit on', true),
      c('.ghost edit off', true),
    ],
  },
  {
    id: 'peek',
    icon: '👀',
    title: 'PEEK',
    commands: [
      c('.peek', true),
      c('.peek auto on|off', true), 
      c('.peek watch on|off', true),
      c('.peek dest owner', true),
      c('.peek dest same', true),
      c('.peek dest both', true),
    ],
  },
  {
    id: 'lurk',
    icon: '🕵️',
    title: 'LURK',
    commands: [
      c('.lurk', true),
      c('.lurk on|off', true),
      c('.lurk react on|off', true),
      c('.lurk download on|off', true),
      c('.lurk emoji ❤️', true),
      c('.lurk emoji random', true),
      c('.lurk emoji none', true),
    ],
  },
  {
    id: 'schedule',
    icon: '⏰',
    title: 'SCHEDULE',
    commands: [
      c('.schedule', true),
      c('.schedule txt date am|pm', true), 
      c('.schedule list', true),
      c('.schedule cancel <id>', true),
      c('.schedule media', true),
    ],
  },
  {
    id: 'utility',
    aliases: ['tools'],
    icon: '🛠',
    title: 'UTILITY & NETWORK',
    commands: [
      c('.currency'),
      c('.qr <text>'),
      c('.qr read'),
      c('.define <word>'),
      c('.weather <city>'),
      c('.pwned <password>'),
      c('.url (reply to media)'),
      c('.reqlocation'),
      c('.relocation'),
      c('.shorten <url>'),
      c('.unroll <short_url>'),
      c('.speedtest'),
      c('.npm <package>'),
      c('.web2img <url>'),
      c('.tempmail'),
      c('.readmail <address>'),
      c('.news [topic]'),
      c('.hackernews'),
      c('.wiki <topic>'),
      c('.joke'),
      c('.advice'),
      c('.fact'),
      c('.githubdiff <url>'),
      c('.urban <slang>'),
      c('.slang <term>'),
      c('.channelinfo <url>'),
      c('.unit <val> <u1> to <u2>'),
      c('.commandcount'),
    ],
  },
  {
    id: 'islamic',
    aliases: ['quran', 'hadith', 'hadees'],
    icon: '🕌',
    title: 'ISLAMIC',
    commands: [
      c('.prayertimes <city>'),
      c('.pts <city>'),
      c('.quran <surah:ayah>'),
      c('.sora <name_or_number>'),
      c('.para <1-30>'),
      c('.muslim <number>'),
      c('.bukhari <number>'),
      c('.search quran <topic>'),
      c('.quransearch <query>'),
      c('.hadeessearch <query>'),
      c('.islamsearch <query>'),
    ],
  },
  {
    id: 'media',
    icon: '📚',
    title: 'MEDIA, AI & TOOLS',
    commands: [
      c('.book <query>'),
      c('.book dl <number>'),
      c('.img <query> [count]'),
      c('.ocr / .readtext'),
      c('.barcode [type] [text]'),
      c('.vcard @user'),
      c('.tts [lang] <text>'),
      c('.sanitize / .exifwipe'),
      c('.trim <start> <end>'),
      c('.tomp3'),
      c('.vn'),
      c('.compress'),
      c('.extracompress'),
      c('.whatanime'),
      c('.gemini <prompt>'),
      c('.scholar <topic/question>'),
      c('.photo / .imagine / .imagen <prompt>'),
      c('.couplepp [count]'),
      c('.movie <title>'),
      c('.series <name> -ep <n> | -full'),
      c('.continue'),
      c('.movieinfo <title>'),
      c('.songinfo <title> [artist]'),
      c('.lyrics <artist> - <title>'),
      c('.ppt <topic>'),
      c('.waveform'),
      c('.8d'),
      c('.bassboost [1-10]'),
      c('.robot'),
      c('.vocal'),
      c('.hd / .enhance'),
      c('.meme "top" | "bottom"'),
      c('.sticker / .s'),
      c('.toimg / .tovid'),
      c('.fancy <text>'),
      c('.dice [spec]'),
      c('.coin [count]'),
    ],
  },
  {
    id: 'download',
    aliases: ['dl'],
    icon: '⬇️',
    title: 'DOWNLOAD',
    commands: [
      c('.dl <url>'),
      c('.dl audio <url>'),
      c('.dl mp3 <url>'),
      c('.play <query>'),
      c('.yt <query/url>'),
      c('.yta <query/url>'),
      c('.ytv <query/url>'),
      c('.video <query/url>'),
      c('.ytdl <url>'),
      c('.dlcap [size|quality]', true),
      c('.disk [tmp|reserve|limit|room]', true),
      c('.pdl <post-url>'),
      c('.pdlzip <post-url>'),
      c('.download <url>'),
      c('.twitter <url>'),
      c('.pinterest <url>'),
      c('.threads <url>'),
      c('.reddit <url>'),
      c('.gitdl <github-url>', true),
      c('.mfdl <mediafire-url>', true),
    ],
  },
  {
    id: 'display',
    aliases: ['wallpaper', 'wp', 'dp'],
    icon: '🖼️',
    title: 'WALLPAPERS',
    commands: [
      c('.wp1 ... .wp10'),
      c('.wp (reply photo)'),
      c('.dp (reply photo)'),
      c('.reset wp'),
    ],
  },
  {
    id: 'textmaker',
    aliases: ['ephoto', 'logo'],
    icon: '🪄',
    title: 'TEXT→PHOTO',
    commands: [
      c('.textmaker <effect> <text>'),
      c('.neon <text>'),
      c('.glitch <text>'),
      c('.3dgold <text>'),
      c('.marvel <text1 ; text2>'),
      c('.pornhub <text1 ; text2>'),
      c('.cyberpunk <text>'),
      c('.graffiti <text>'),
      c('.blackpink <text>'),
      c('.naruto <text>'),
      c('.galaxy <text>'),
      c('.blood <text>'),
      c('.hologram <text>'),
      c('.matrix <text>'),
      c('.slice <text>'),
      c('.luxury <text>'),
      c('.vintage <text>'),
      c('.lightglow <text>'),
      c('.sand <text>'),
      c('.water <text>'),
      c('.fire <text>'),
      c('.metallic <text>'),
      c('.space <text>'),
      c('.neonlight <text>'),
      c('.glowing <text>'),
      c('.captainamerica <text>'),
      c('.wall <text>'),
      c('.paper <text>'),
      c('.circuit <text>'),
      c('.neondevil <text>'),
      c('.dragon <text>'),
      c('.comic <text>'),
      c('.titanium <text>'),
      c('.sunset <text>'),
      c('.balloon <text>'),
      c('.silver <text>'),
      c('.paint <text>'),
      c('.xmas <text>'),
      c('.sparkle <text>'),
      c('.american <text>'),
      c('.blueneon <text>'),
      c('.greenneon <text>'),
      c('.goldletter <text>'),
      c('.pubg <text>'),
      c('.starwars <text>'),
      c('.neonart <text>'),
      c('.glitchneon <text>'),
    ],
  },
  {
    id: 'social',
    aliases: ['social,search'],
    icon: '📥',
    title: 'SEARCH|DL',
    commands: [
      c('.ig <username/url>  (.insta / .instagram)'),
      c('.tiktok <username/url>'),
      c('.fb <username/url>'),
    ],
  },
  {
    id: 'group',
    aliases: ['admin', 'groupadmin'],
    icon: '👨‍👩‍👧‍👧',
    title: 'GROUP ADMIN',
    commands: [
      c('.open', true),
      c('.close', true),
      c('.schedule open date time', true),
      c('.schedule close date time', true),
      c('.kick (reply|num)', true),
      c('.add <number>', true),
      c('.promote (reply|num)', true),
      c('.demote (reply|num)', true),
      c('.tag [msg]', true),
      c('.tagall [msg]', true),
      c('.tag admin [msg]', true),
      c('.hidetag [msg]', true),
      c('.hidetag admin [msg]', true),
      c('.pdd <on|off>'),
      c('.pinchat', true),
      c('.unpinchat', true),
      c('.setgdesc <text>', true),
      c('.setgpp', true),
      c('.welcome on'),
      c('.welcome off'),
      c('.goodbye on'),
      c('.goodbye off'),
      c('.antilink on|off', true),
      c('.antispam on|off', true),
      c('.antisticker on|off', true),
      c('.kickall', true),
      c('.kickcc <code>', true),
      c('.approveall', true),
      c('.declineall', true),
      c('.leave', true),
      c('.join <link>', true),
      c('.gclone', true),
      c('.revoke', true),
      c('.gshield on|off', true),
      c('.fakereply @user text|reply'),
      c('.antipromote on|off', true),
      c('.antidemote on|off', true),
      c('.purge [count]', true),
      c('.antibot on|off', true),
      c('.warn @user [reason]', true),
      c('.warns [@user]'),
      c('.resetwarns @user', true),
    ],
  },
  {
    id: 'owner',
    aliases: ['profile', 'only-owner'],
    icon: '⛔',
    title: 'OWNER PROFILE',
    commands: [
      c('.setpp', true),
      c('.setabout <text>', true),
      c('.setstatus reply|text', true),
      c('.getstatus <number|jid>', true),
      c('.replymode text|poll|list|buttons', true),
      c('.getpair <number>', true),
      c('.setsession ownernumber', true),
      c('.addsession <number>', true),
      c('.delsession <id>', true),
      c('.setvar <key> <value>', true),
      c('.getvar <key|all>', true),
      c('.delvar <key>', true),
      c('.block (reply|num)', true),
      c('.unblock (reply|num)', true),
      c('.blocklist', true),
      c('.unblockall', true),
      c('.rejectcalls on', true),
      c('.rejectcalls off', true),
      c('.stalk <number>', true),
      c('.stalk list', true),
      c('.stalk stop <number>', true),
      c('.noaction @user', true),
      c('.statusalert <number>', true),
      c('.watch <number>', true),
      c('.ginfo <link>', true),
      c('.chatstats <number>', true),
      c('.setowner <number|me>', true),
      c('.addowner <number>', true),
      c('.delowner <number>', true),
      c('.owner list', true),
      c('.privacy lastseen|pfp|groupadd', true),
      c('.stealfull @user', true),
    ],
  },
  {
    id: 'chat',
    aliases: ['chatcontrols'],
    icon: '💬',
    title: 'CHAT CONTROLS',
    commands: [
      c('.disappearing 24h|7d|90d'),
      c('.ytcookies', true),
      c('.mute 8h|1d|forever', true),
      c('.unmute', true),
      c('.archive', true),
      c('.unarchive', true),
      c('.clearchat', true),
      c('.pinchat', true),
      c('.unpinchat', true),
    ],
  },
  {
    id: 'jid',
    aliases: ['jidprofile'],
    icon: '🧭',
    title: 'JID|PROFILE',
    commands: [
      c('.getjid'),
      c('.getpp'),
      c('.presence', true),
      c('.presence online on|off', true),
      c('.presence typing on|off', true),
      c('.presence recording on|off', true),
      c('.presence reads on|off', true),
      c('.activity', true),
    ],
  },
];

// extras pack categories (modules/x-details.js)
REGISTRY.push(...X_MENU);

function applyPrefix(cmd, prefix) {
  if (prefix === '.') return cmd;
  return cmd.startsWith('.') ? prefix + cmd.slice(1) : cmd;
}

function visibleRegistry(isOwnerUser) {
  if (isOwnerUser) return REGISTRY;
  return REGISTRY
    .map((g) => ({
      ...g,
      commands: g.commands.filter((x) => !x.ownerOnly),
    }))
    .filter((g) => g.commands.length > 0);
}

function renderHeaderBox(prefix, isOwnerUser) {
  const ownerText = isOwnerUser ? toSmallCaps('COMMANDS ARE OWNER-ONLY') : toSmallCaps('COMMANDS ARE PUBLIC');
  const guideCmd = applyPrefix('.ᴄᴏᴍᴍᴀɴᴅ ꜰᴏʀ ɢᴜɪᴅᴇ', prefix);
  return [
    '      【 🤖 𝐀𝐥-𝐉𝐢𝐧 🤖 】',
    '┌──────────────────┈⚝',
    `│ ${ownerText}`,
    `│ ${toSmallCaps('PREFIX')} · ${prefix}`,
    `│ ℹ️ ${guideCmd}`,
    '│',
    '└──────────────────┈⚝',
  ].join('\n');
}

function renderCategoryBox(group, prefix, isOwnerUser) {
  const visible = isOwnerUser
    ? group.commands
    : group.commands.filter((x) => !x.ownerOnly);

  if (!visible.length) return null;

  const lines = [
    `      _*【 ${group.icon} ${toSmallCaps(group.title)} 】*_`,
    '┌──────────────────┈⚝',
  ];

  for (const item of visible) {
    lines.push(`│ ◈ ${applyPrefix(item.cmd, prefix)}`);
  }

  lines.push('└──────────────────┈⚝');

  return lines.join('\n');
}

function renderAllPlainText(prefix, isOwnerUser) {
  const header = renderHeaderBox(prefix, isOwnerUser);
  const groups = visibleRegistry(isOwnerUser);
  const categoryBoxes = [];

  for (const group of groups) {
    const box = renderCategoryBox(group, prefix, isOwnerUser);
    if (box) categoryBoxes.push(box);
  }

  return [header, ...categoryBoxes].join('\n');
}

function findGroup(name) {
  const wanted = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!wanted) return null;
  return (
    REGISTRY.find((g) => {
      const ids = [g.id, ...(g.aliases || [])];
      if (ids.some((x) => x.toLowerCase() === wanted)) return true;
      const cleanedTitle = g.title.replace(/[^a-z]/gi, '').toLowerCase();
      return cleanedTitle === wanted;
    }) || null
  );
}

export async function helpCommand(sock, chat, msg, args) {
  try {
    const from = msg.key.participant || msg.key.remoteJid;
    const isOwnerUser = msg.key.fromMe || isOwner(from);
    const prefix = getPrefix();

    const target = (args?.[0] || '').toLowerCase().trim();

    if (!target) {
      const text = renderAllPlainText(prefix, isOwnerUser);
      return await sendMenu(sock, chat, text, msg);
    }

    const group = findGroup(target);

    if (!group) {
      const avail = visibleRegistry(isOwnerUser)
        .map((g) => `• ${g.id}`)
        .join(' · ');
      return await sendWithCta(
        sock,
        chat,
        `❓ Unknown menu category: *${target}*\n\nAvailable categories:\n${avail}`,
        { quoted: msg }
      );
    }

    const box = renderCategoryBox(group, prefix, isOwnerUser);

    if (!box) {
      return await sendWithCta(
        sock,
        chat,
        `🔒 Category *${group.title}* is owner-only.`,
        { quoted: msg }
      );
    }

    const text = [renderHeaderBox(prefix, isOwnerUser), box].join('\n');

    return await sendMenu(sock, chat, text, msg);
  } catch (e) {
    try {
      await sock.sendMessage(
        chat,
        { text: `⚠️ help failed: ${e.message}`, contextInfo: newsletterContext() },
        { quoted: msg }
      );
    } catch {}
  }
}

// .imenu [on|off|preview] — owner only
export async function imenuCommand(sock, chat, msg, args) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) {
    return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  }
  const prefix = getPrefix();
  const arg = String(args?.[0] || '').toLowerCase();
  const info = {
    on: 'image embedded in the menu (single message)',
    preview: 'text menu with the image as a preview card (single message)',
    off: 'normal text menu, no image',
  };
  const cardInfo = `link card (opens ${imenuCardUrl()})`;
  const cardReady = () => !!(getSetting('imenuCardUrl') && getSetting('imenuCardTitle'));
  if (arg === 'card') {
    const url = String(args?.[1] || '').trim();
    if (url) {
      if (!/^https?:\/\/\S+$/i.test(url)) {
        return sock.sendMessage(chat, { text: `⚠️ Give a full link starting with http:// or https://\n\nExample: \`${prefix}imenu card https://example.com\`` }, { quoted: msg });
      }
      setSetting('imenuCardUrl', url);
    }
    setSetting('imenu', 'card');                      // .imenu card always makes the menu a card
    return sock.sendMessage(chat, { text: `✅ Menu is now shown as a *CARD*.\n\nTitle: ${getSetting('imenuCardTitle') || '𝗔𝗟-𝗝𝗜𝗡 (default)'}\nLink: ${imenuCardUrl()}\n\nChange: \`${prefix}imenu card <url>\` · \`${prefix}imenu cardtitle <text>\`\nBack to normal: \`${prefix}imenu on|off|preview\`` }, { quoted: msg });
  }
  if (arg === 'quote') {
    const v = String(args?.[1] || '').toLowerCase();
    if (v !== 'on' && v !== 'off') {
      return sock.sendMessage(chat, { text: `💬 Business-status quote on the menu is *${menuQuoteOn() ? 'ON' : 'OFF'}*\n\nUsage: \`${prefix}imenu quote on|off\`\n` }, { quoted: msg });
    }
    setSetting('imenuQuote', v);
    return sock.sendMessage(chat, { text: `✅ Menu business-status quote *${v.toUpperCase()}*.` }, { quoted: msg });
  }
  if (arg === 'cardtitle') {
    const t = (args || []).slice(1).join(' ').trim();
    if (!t) return sock.sendMessage(chat, { text: `Usage: \`${prefix}imenu cardtitle <text>\`` }, { quoted: msg });
    setSetting('imenuCardTitle', t);
    // title + link both set -> the menu becomes the card automatically
    if (cardReady()) {
      setSetting('imenu', 'card');
      return sock.sendMessage(chat, { text: `✅ Card title set to *${t}*.\nTitle and link are both set, so the menu is now shown as a *CARD*.\nLink: ${imenuCardUrl()}` }, { quoted: msg });
    }
    return sock.sendMessage(chat, { text: `✅ Card title set to *${t}*.\nNow set the link with \`${prefix}imenu card <url>\` and the menu will switch to the card.` }, { quoted: msg });
  }
  if (info[arg]) {
    setSetting('imenu', arg);
    return sock.sendMessage(chat, { text: `✅ Image menu *${arg.toUpperCase()}* — ${info[arg]}.` }, { quoted: msg });
  }
  return sock.sendMessage(chat, { text: `🖼️ Image menu is *${imenuMode().toUpperCase()}*\n\nUsage:\n• \`${prefix}imenu off\` — ${info.off} \n• \`${prefix}imenu on\` — ${info.on} (default)\n• \`${prefix}imenu preview\` — ${info.preview}\n• \`${prefix}imenu card [url]\` — ${cardInfo} (switches the menu to the card)\n• \`${prefix}imenu cardtitle <text>\` — card title` }, { quoted: msg });
}
