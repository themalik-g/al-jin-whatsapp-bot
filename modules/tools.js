// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/tools.js
// OCR, Barcode, VCard, TTS utilities
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import PQueue from 'p-queue';
import bwipjs from 'bwip-js';
import { createWorker } from 'tesseract.js';
import { getMediaFromMsg } from './media-tools.js';
import { ffmpegPath } from '../lib/ffmpeg-resolver.js';
import { chunkText } from '../lib/net.js';
import { sendInteractive, createCtaCopy } from '../lib/buttons.js';
import { getKey } from '../core/keys.js';
import { getVar } from '../core/vars.js';

const ocrQueue = new PQueue({ concurrency: 2 });

const TMP_DIR = () => {
  const dir = path.resolve(process.env.MEHTAB_MD_DATA_DIR || process.cwd(), 'data', 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

function runFfmpeg(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`FFmpeg error: ${err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

// ── .ocr / .readtext ────────────────────────────────────────────────────────
async function extractTextWithGemini(imageBuffer, mimeType, apiKey) {
  const base64Data = imageBuffer.toString('base64');
  const actualMime = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

  const prompt = 'Perform exact optical character recognition (OCR) on this image. Transcribe all visible text verbatim exactly as written, including handwriting, preserving line breaks where appropriate. Do not add intro, explanations, or commentary—output ONLY the transcribed text.';

  const models = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: actualMime, data: base64Data } },
              { text: prompt }
            ]
          }]
        })
      });

      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return text.trim();
        }
      }
    } catch (err) {
      console.warn(`[ocrCommand] Gemini Vision ${model} error:`, err.message);
    }
  }
  return '';
}

export async function ocrCommand(sock, chat, msg, args) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || media.kind !== 'image') {
      return sock.sendMessage(chat, { text: '❌ Please reply to an image with `.ocr` or `.readtext`.' }, { quoted: msg });
    }

    const userLang = (args && args[0] && args[0].length >= 2 && args[0].length <= 8)
      ? args[0].toLowerCase()
      : null;

    await sock.sendMessage(chat, { text: '🔤 Extracting text from image...' }, { quoted: msg });

    let text = '';
    const apiKey = getVar('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || getKey('GEMINI_API_KEY');

    if (apiKey) {
      try {
        text = await extractTextWithGemini(media.buffer, media.mimetype || 'image/jpeg', apiKey);
      } catch (geminiErr) {
        console.warn('[ocrCommand] Gemini Vision failed, falling back to Tesseract:', geminiErr.message);
      }
    }

    if (!text) {
      const lang = userLang || 'eng';
      const recognizedText = await ocrQueue.add(async () => {
        const worker = await createWorker(lang);
        try {
          const ret = await worker.recognize(media.buffer);
          return ret.data.text;
        } finally {
          await worker.terminate();
        }
      });
      text = recognizedText?.trim();
    }

    if (!text) {
      return sock.sendMessage(chat, { text: '❌ No readable text found in image.' }, { quoted: msg });
    }

    const chunks = chunkText(text, 3800);
    for (const chunk of chunks) {
      await sendInteractive(sock, chat, {
        body: chunk,
        footer: 'Provided by 𝗪𝗥𝗔Ｉ𝗧🇭',
        buttons: [createCtaCopy('📋 Copy Text', text)],
      }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ ocr failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .barcode [type] [text] ─────────────────────────────────────────────────
const BARCODE_TYPES = new Set([
  'code128', 'ean13', 'ean8', 'upca', 'upce', 'code39', 'qr', 'qrcode',
  'pdf417', 'datamatrix', 'aztec', 'itf14', 'postnet'
]);

export async function barcodeCommand(sock, chat, msg, args) {
  try {
    if (!args || !args.length) {
      return sock.sendMessage(chat, {
        text: '📊 *barcode*\n\nUsage:\n• `.barcode <text>` (defaults to code128)\n• `.barcode ean13 1234567890128`\n• `.barcode qr Hello World`',
      }, { quoted: msg });
    }

    let type = 'code128';
    let text = args.join(' ');

    const firstArg = args[0].toLowerCase();
    if (BARCODE_TYPES.has(firstArg) && args.length > 1) {
      type = firstArg === 'qr' ? 'qrcode' : firstArg;
      text = args.slice(1).join(' ');
    }

    const pngBuffer = await bwipjs.toBuffer({
      bcid: type,
      text: text,
      scale: 3,
      height: type === 'qrcode' ? 20 : 10,
      includetext: true,
      textxalign: 'center',
    });

    await sock.sendMessage(chat, {
      image: pngBuffer,
      caption: `📊 *Barcode (${type.toUpperCase()})*\n\nText: \`${text}\`\n\nProvided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃`,
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ barcode failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .vcard @user/number/jid ─────────────────────────────────────────────────
export async function vcardCommand(sock, chat, msg, args) {
  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = ctx?.mentionedJid?.[0] || ctx?.participant;

    if (!targetJid && args && args[0]) {
      const raw = args[0].replace(/[^\d@a-zA-Z.-]/g, '');
      if (raw.includes('@')) {
        targetJid = raw;
      } else if (/^\d+$/.test(raw)) {
        targetJid = `${raw}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      targetJid = msg.key.participant || msg.key.remoteJid;
    }

    const digits = targetJid.replace(/\D/g, '');
    const name = digits ? `User +${digits}` : 'WhatsApp Contact';

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name}`,
      `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
      'END:VCARD',
    ].join('\n');

    await sock.sendMessage(chat, {
      contacts: {
        displayName: name,
        contacts: [{ vcard }],
      },
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ vcard failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .tts [lang] [text] ──────────────────────────────────────────────────────
export async function ttsCommand(sock, chat, msg, args) {
  try {
    if (!args || !args.length) {
      return sock.sendMessage(chat, {
        text: '🗣️ *tts*\n\nUsage:\n• `.tts Hello world` (defaults to English)\n• `.tts es Hola mundo`\n• `.tts ur السلام عليكم`',
      }, { quoted: msg });
    }

    let lang = 'en';
    let text = args.join(' ');

    if (args[0].length === 2 || args[0].length === 5) {
      if (/^[a-z]{2}(-[a-z]{2,4})?$/i.test(args[0]) && args.length > 1) {
        lang = args[0].toLowerCase();
        text = args.slice(1).join(' ');
      }
    }

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

    const res = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!res.ok) {
      throw new Error(`TTS API failed with status ${res.status}`);
    }

    const mp3Buf = Buffer.from(await res.arrayBuffer());

    const tmpIn = path.join(TMP_DIR(), `tts_in_${Date.now()}.mp3`);
    const tmpOut = path.join(TMP_DIR(), `tts_out_${Date.now()}.opus`);

    fs.writeFileSync(tmpIn, mp3Buf);

    try {
      await runFfmpeg(['-y', '-i', tmpIn, '-vn', '-c:a', 'libopus', '-b:a', '64k', tmpOut]);
      const opusBuf = fs.readFileSync(tmpOut);

      await sock.sendMessage(chat, {
        audio: opusBuf,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ tts failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
