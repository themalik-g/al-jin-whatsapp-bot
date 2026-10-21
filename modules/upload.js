// ─────────────────────────────────────────────
// Al-Jin · modules/upload.js
//   .upload              reply to any file (image / video / audio / document / sticker) — or send one with the
//                        caption .upload — and get a public link. The host is chosen by size so the file stays
//                        online as long as possible: Catbox (≤ 200 MB, never expires) → 0x0.st (≤ 512 MB,
//                        30 days–1 year) → Buzzheavier / Gofile (no size cap, ≈ 10–45 days). See lib/filehost.js.
//   .upload info         the hosts with their size limits and retention
//   .upload <host>       force one host:  catbox · 0x0 · buzz · gofile · litter
// Owner only (a public upload command would be abused). The size cap is the same one as for downloads (.dlcap).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { findMedia, isOwnerMsg } from '../lib/x.js';
import { uploadFile, hostsTable, HOST_ALIASES, HOSTS } from '../lib/filehost.js';
import { sendWithCta } from '../lib/buttons.js';
import { reactMsg, editStatus, EMOJIS } from '../lib/reaction-helper.js';
import { getMaxDownloadMB, getMaxDownloadBytes, fmtMB } from '../core/limits.js';

const queue = new PQueue({ concurrency: 1 });
const TMP = path.resolve(process.env.WRAITH_DATA_DIR || process.cwd(), 'data', 'tmp', 'wraith-upload');
const MB = fmtMB;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/ogg; codecs=opus': 'ogg', 'application/pdf': 'pdf', 'application/zip': 'zip' };
const extOf = (mime) => EXT[String(mime || '').toLowerCase()] || EXT[String(mime || '').toLowerCase().split(';')[0]] || (String(mime || '').split('/')[1] || 'bin').split(';')[0].replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';

function infoText() {
  const rows = hostsTable().map(([h, size, keep]) => `• *${h}* — up to ${size} · ${keep}`).join('\n');
  return [
    '📤 *Upload hosts*',
    '',
    rows,
    '',
    '_The bot picks the host by file size so the file stays online as long as possible, and tries the next host if one fails. Limits are what the hosts publish and can change._',
    '',
    '`.upload` — reply to a file · `.upload <catbox|0x0|buzz|gofile|litter>` — force a host',
  ].join('\n');
}

function cleanOld() {
  try {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const f of fs.readdirSync(TMP)) {
      const p = path.join(TMP, f);
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  } catch { /* no folder yet */ }
}

// WhatsApp media → a file on disk (streamed, with a size cap)
async function saveMedia(media, dest, maxBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stream = await downloadContentFromMessage(media.node, media.kind);
  const out = fs.createWriteStream(dest);
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('over the size cap');
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((res, rej) => { out.end((e) => (e ? rej(e) : res())); });
  } catch (e) {
    // wait until the stream is really closed — deleting while its open() is still pending would recreate an empty file
    await new Promise((res) => { out.once('close', res); out.destroy(); });
    try { fs.unlinkSync(dest); } catch {}
    throw e;
  }
  return size;
}

export async function uploadCommand(sock, chat, msg, args) {
  if (!isOwnerMsg(msg)) {
    return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  }
  const word = String(args?.[0] || '').toLowerCase();
  if (word === 'info' || word === 'hosts' || word === 'limits') {
    return sendWithCta(sock, chat, infoText(), { quoted: msg });
  }
  const force = word ? HOST_ALIASES[word] : '';
  if (word && !force) {
    return sendWithCta(sock, chat, `❌ Unknown host "${word}".\n\n${infoText()}`, { quoted: msg });
  }

  const media = findMedia(msg);
  if (!media) {
    return sendWithCta(sock, chat, `📤 *Upload*\n\nReply to a file (image, video, audio or document) with \`.upload\`, or send one with \`.upload\` as its caption.\n\n_\`.upload info\` shows the hosts and how long they keep files._`, { quoted: msg });
  }

  return queue.add(async () => {
    cleanOld();
    const cap = getMaxDownloadBytes();
    const declared = Number(media.node.fileLength) || 0;
    if (declared > cap) {
      reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
      return sock.sendMessage(chat, { text: `⚠️ That file is ${MB(declared)} MB — over the ${getMaxDownloadMB()} MB cap. Raise it with \`.dlcap 2gb\`.` }, { quoted: msg });
    }

    reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
    const statusP = sock.sendMessage(chat, { text: '📥 Fetching the file from WhatsApp…' }, { quoted: msg }).catch(() => null);
    let status = null; statusP.then((s) => { status = s; });
    const mime = media.node.mimetype || '';
    const name = String(media.node.fileName || '').trim() || `${media.kind}_${Date.now()}.${extOf(mime)}`;
    const file = path.join(TMP, `up_${Date.now()}_${Math.floor(Math.random() * 1000)}_${name.replace(/[^\w.-]+/g, '_')}`);

    try {
      const size = await saveMedia(media, file, cap);
      if (size < 1) throw new Error('the file is empty');
      await statusP;
      reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      let last = -1;
      const head = `📤 *${name}* · ${MB(size)} MB`;
      await editStatus(sock, chat, status, `${head}\nUploading 0% done...`);
      const r = await uploadFile(file, {
        name, mime, size, force,
        onProgress: (p) => { if (p - last >= 10 || p === 100) { last = p; editStatus(sock, chat, status, `${head}\nUploading ${p}% done...`); } },
        onTry: (host, i) => { if (i > 0) { last = -1; editStatus(sock, chat, status, `${head}\n🔁 *Trying ${host}…*`); } },
      });

      await sock.sendMessage(chat, {
        text: `📤 *Upload complete*\n\n🔗 ${r.url}\n\n📦 ${name} · ${MB(r.size)} MB\n🏠 ${r.host}\n⏳ Kept: ${r.retention}\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
      }, { quoted: msg });
      await editStatus(sock, chat, status, `✅ *Uploaded* to ${r.host}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error('[upload]', e?.message || e);
      await statusP;
      const m = /over the size cap/.test(e?.message || '') ? `over the ${getMaxDownloadMB()} MB cap — raise it with \`.dlcap 2gb\`` : (e?.message || String(e));
      await editStatus(sock, chat, status, `❌ *Upload failed:* ${m}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      try { fs.unlinkSync(file); } catch {}
    }
  });
}
