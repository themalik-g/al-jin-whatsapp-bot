// ─────────────────────────────────────────────
// WRAITH · modules/media-tools.js
// Media utilities: exifwipe/sanitize, trim, tomp3, vn, compress, extracompress
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { ffmpegPath } from '../lib/ffmpeg-resolver.js';

const TMP_DIR = () => {
  const dir = path.resolve(process.env.WRAITH_DATA_DIR || process.cwd(), 'data', 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

function runFfmpeg(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`FFmpeg error: ${err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Extract media buffer/mimetype from direct message or quoted message
 */
export async function getMediaFromMsg(msg) {
  let node = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage || msg.message?.audioMessage;
  let kind = msg.message?.imageMessage ? 'image'
    : msg.message?.videoMessage ? 'video'
    : msg.message?.documentMessage ? 'document'
    : msg.message?.audioMessage ? 'audio'
    : null;

  if (!node) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (quoted) {
      node = quoted.imageMessage || quoted.videoMessage || quoted.documentMessage || quoted.audioMessage;
      kind = quoted.imageMessage ? 'image'
        : quoted.videoMessage ? 'video'
        : quoted.documentMessage ? 'document'
        : quoted.audioMessage ? 'audio'
        : null;
    }
  }

  if (!node || !kind) return null;

  const stream = await downloadContentFromMessage(node, kind);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const buffer = Buffer.concat(chunks);
  const mimetype = node.mimetype || (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'application/octet-stream');
  const fileName = node.fileName || `file_${Date.now()}`;

  return { buffer, kind, mimetype, fileName };
}

// ── .exifwipe / .sanitize ───────────────────────────────────────────────────
export async function exifwipeCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media) {
      return sock.sendMessage(chat, { text: '❌ Send or reply to an image/video/document with `.sanitize` or `.exifwipe`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `wipe_in_${Date.now()}`);
    const ext = media.mimetype.includes('png') ? '.png' : media.mimetype.includes('jpeg') || media.mimetype.includes('jpg') ? '.jpg' : media.mimetype.includes('mp4') ? '.mp4' : media.mimetype.includes('webp') ? '.webp' : '.bin';
    const tmpOut = path.join(TMP_DIR(), `wipe_out_${Date.now()}${ext}`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      if (media.kind === 'image') {
        await runFfmpeg(['-y', '-i', tmpIn, '-map_metadata', '-1', '-c:v', 'copy', tmpOut]);
      } else {
        await runFfmpeg(['-y', '-i', tmpIn, '-map_metadata', '-1', '-c', 'copy', tmpOut]);
      }

      const outBuf = fs.readFileSync(tmpOut);
      if (media.kind === 'image') {
        await sock.sendMessage(chat, { image: outBuf, caption: '🧹 *EXIF Metadata Stripped*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭' }, { quoted: msg });
      } else if (media.kind === 'video') {
        await sock.sendMessage(chat, { video: outBuf, caption: '🧹 *EXIF Metadata Stripped*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭' }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { document: outBuf, mimetype: media.mimetype, fileName: `sanitized_${media.fileName}`, caption: '🧹 *EXIF Metadata Stripped*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭' }, { quoted: msg });
      }
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ sanitize failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .trim [start] [end] ─────────────────────────────────────────────────────
export async function trimCommand(sock, chat, msg, args) {
  try {
    const start = args[0];
    const end = args[1];
    if (!start || !end) {
      return sock.sendMessage(chat, { text: '✂️ *trim*\n\nUsage: `.trim 00:05 00:20` or `.trim 5 20`\nReply to a video or audio file.' }, { quoted: msg });
    }

    const timeRegex = /^(?:(?:\d+:)?\d+:)?\d+(?:\.\d+)?$/;
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      return sock.sendMessage(chat, { text: '❌ Invalid time format. Examples: `00:05`, `01:30`, `5`' }, { quoted: msg });
    }

    const media = await getMediaFromMsg(msg);
    if (!media || (media.kind !== 'video' && media.kind !== 'audio')) {
      return sock.sendMessage(chat, { text: '❌ Please reply to a video or audio file with `.trim <start> <end>`.' }, { quoted: msg });
    }

    const ext = media.kind === 'video' ? '.mp4' : '.mp3';
    const tmpIn = path.join(TMP_DIR(), `trim_in_${Date.now()}${ext}`);
    const tmpOut = path.join(TMP_DIR(), `trim_out_${Date.now()}${ext}`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg(['-y', '-ss', start, '-to', end, '-i', tmpIn, '-c', 'copy', tmpOut]);
      const outBuf = fs.readFileSync(tmpOut);

      if (media.kind === 'video') {
        await sock.sendMessage(chat, { video: outBuf, caption: `✂️ *Trimmed* (${start} → ${end})\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭` }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/mpeg', ptt: false, caption: `✂️ *Trimmed* (${start} → ${end})\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭` }, { quoted: msg });
      }
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ trim failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .tomp3 ──────────────────────────────────────────────────────────────────
export async function tomp3Command(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media) {
      return sock.sendMessage(chat, { text: '❌ Reply to a video, document audio, or voice note with `.tomp3`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `tomp3_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `tomp3_out_${Date.now()}.mp3`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg(['-y', '-i', tmpIn, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', tmpOut]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ tomp3 failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .vn ─────────────────────────────────────────────────────────────────────
export async function vnCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media) {
      return sock.sendMessage(chat, { text: '❌ Reply to a video or audio file with `.vn` to convert to a WhatsApp voice note.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `vn_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `vn_out_${Date.now()}.opus`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg(['-y', '-i', tmpIn, '-vn', '-c:a', 'libopus', '-b:a', '64k', tmpOut]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ vn failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .compress / .extracompress ──────────────────────────────────────────────
export async function compressCommand(sock, chat, msg, args, isExtra = false) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media) {
      return sock.sendMessage(chat, { text: '❌ Send or reply to a video or image with `.compress` or `.extracompress`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `cmp_in_${Date.now()}`);
    fs.writeFileSync(tmpIn, media.buffer);

    if (media.kind === 'video') {
      const tmpOut = path.join(TMP_DIR(), `cmp_out_${Date.now()}.mp4`);
      try {
        await runFfmpeg(['-y', '-i', tmpIn, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '28', '-preset', 'faster', '-c:a', 'aac', '-b:a', '96k', tmpOut]);
        const outBuf = fs.readFileSync(tmpOut);
        await sock.sendMessage(chat, { video: outBuf, caption: `📉 *Video Compressed* (${(outBuf.length / (1024 * 1024)).toFixed(2)} MB)\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭` }, { quoted: msg });
      } finally {
        try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
      }
    } else if (media.kind === 'image') {
      const targetKb = isExtra ? 200 : 400;
      const tmpOut = path.join(TMP_DIR(), `cmp_out_${Date.now()}.jpg`);
      try {
        // Try compression with quality scaling
        let quality = isExtra ? 30 : 50;
        await runFfmpeg(['-y', '-i', tmpIn, '-vf', 'scale=1080:-2', '-q:v', String(quality), tmpOut]);
        let outBuf = fs.readFileSync(tmpOut);

        if (outBuf.length > targetKb * 1024) {
          // Downscale further if still above target
          await runFfmpeg(['-y', '-i', tmpIn, '-vf', 'scale=720:-2', '-q:v', '20', tmpOut]);
          outBuf = fs.readFileSync(tmpOut);
        }

        await sock.sendMessage(chat, { image: outBuf, caption: `📉 *Image Compressed* (${(outBuf.length / 1024).toFixed(1)} KB)\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭` }, { quoted: msg });
      } finally {
        try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
      }
    } else {
      await sock.sendMessage(chat, { text: '❌ Compression only supports video and image files.' }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ compress failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .waveform ───────────────────────────────────────────────────────────────
export async function waveformCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || (media.kind !== 'audio' && media.kind !== 'video')) {
      return sock.sendMessage(chat, { text: '❌ Reply to an audio file or voice note with `.waveform`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `wave_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `wave_out_${Date.now()}.png`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-filter_complex', 'showwavespic=s=600x200:colors=white',
        '-vframes', '1',
        tmpOut
      ]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { image: outBuf, caption: '🌊 *Audio Waveform*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭' }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ waveform failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .8d (8D Spatial Audio) ──────────────────────────────────────────────────
export async function audio8dCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || (media.kind !== 'audio' && media.kind !== 'video')) {
      return sock.sendMessage(chat, { text: '❌ Reply to an audio file or voice note with `.8d`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `audio8d_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `audio8d_out_${Date.now()}.mp3`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-af', 'apulsator=hz=0.125',
        '-c:a', 'libmp3lame', '-q:a', '2',
        tmpOut
      ]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ 8d failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .bassboost [level] (1 to 10) ───────────────────────────────────────────
export async function bassboostCommand(sock, chat, msg, args) {
  try {
    let level = parseInt(args?.[0] || '5', 10);
    if (isNaN(level) || level < 1) level = 1;
    if (level > 10) level = 10;

    const gain = level * 2; // Linear boost from 2dB to 20dB

    const media = await getMediaFromMsg(msg);
    if (!media || (media.kind !== 'audio' && media.kind !== 'video')) {
      return sock.sendMessage(chat, { text: '❌ Reply to an audio file or voice note with `.bassboost [level 1-10]`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `bass_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `bass_out_${Date.now()}.mp3`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-af', `equalizer=f=60:width_type=h:width=50:g=${gain}`,
        '-c:a', 'libmp3lame', '-q:a', '2',
        tmpOut
      ]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ bassboost failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .robot / .vocal ─────────────────────────────────────────────────────────
export async function robotCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || (media.kind !== 'audio' && media.kind !== 'video')) {
      return sock.sendMessage(chat, { text: '❌ Reply to an audio file or voice note with `.robot`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `robot_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `robot_out_${Date.now()}.mp3`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-af', 'flanger=delay=20:depth=10:regen=50',
        '-c:a', 'libmp3lame', '-q:a', '2',
        tmpOut
      ]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ robot failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function vocalCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || (media.kind !== 'audio' && media.kind !== 'video')) {
      return sock.sendMessage(chat, { text: '❌ Reply to an audio file or voice note with `.vocal`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `vocal_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `vocal_out_${Date.now()}.mp3`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-af', 'equalizer=f=1000:width_type=h:width=200:g=6,equalizer=f=3000:width_type=h:width=500:g=4',
        '-c:a', 'libmp3lame', '-q:a', '2',
        tmpOut
      ]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { audio: outBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ vocal failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .hd / .enhance ──────────────────────────────────────────────────────────
export async function enhanceCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || media.kind !== 'image') {
      return sock.sendMessage(chat, { text: '❌ Reply to or send an image with `.hd` or `.enhance`.' }, { quoted: msg });
    }

    const tmpIn = path.join(TMP_DIR(), `hd_in_${Date.now()}`);
    const tmpOut = path.join(TMP_DIR(), `hd_out_${Date.now()}.jpg`);

    fs.writeFileSync(tmpIn, media.buffer);

    try {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-vf', 'unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.15:brightness=0.02',
        tmpOut
      ]);
      const outBuf = fs.readFileSync(tmpOut);
      await sock.sendMessage(chat, { image: outBuf, caption: '✨ *Image Enhanced & Sharpened*\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭' }, { quoted: msg });
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ enhance failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
