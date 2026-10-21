// ─────────────────────────────────────────────
// Al-Jin · modules/gdrive.js
//   .gd <drive link>                    download a Google Drive file (shared as "Anyone with the link")
//   .gd <docs/sheets/slides link> [fmt] export a Google Doc / Sheet / Slides (pdf, docx, xlsx, csv, pptx, txt …)
//   .gd <folder link>                   list the files of a public folder to pick from (per .replymode)
// Also works as a reply to a message that contains the link.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import { argOrQuoted } from '../lib/x.js';
import { findDriveLink, openDriveDownload, saveResponse, listDriveFolder, kindOf } from '../lib/gdrive.js';
import { sendWithCta, sendInteractive, createSingleSelect } from '../lib/buttons.js';
import { reactMsg, editStatus, EMOJIS } from '../lib/reaction-helper.js';
import { getMaxDownloadMB, getMaxDownloadBytes, getDocThresholdBytes, fmtMB } from '../core/limits.js';

const queue = new PQueue({ concurrency: 1 });
const MB = fmtMB;
const TMP = path.resolve(process.env.WRAITH_DATA_DIR || process.cwd(), 'data', 'tmp', 'wraith-gdrive');
const IMAGE_LIMIT = 15 * 1024 * 1024;           // bigger pictures go as documents (WhatsApp's image limit)
const VIDEO_OK = /^(mp4|mov|3gp|m4v)$/i;        // other containers (mkv / avi / webm) are safer as documents
const FORMAT_RE = /^(pdf|docx?|txt|odt|rtf|html|epub|xlsx?|csv|tsv|ods|pptx?|png|jpe?g|svg)$/i;

const USAGE = [
  '📁 *Google Drive downloader*',
  '',
  '`.gd <drive link>` — download a file',
  '`.gd <docs/sheets/slides link> pdf` — export a Google Doc / Sheet / Slides (pdf, docx, xlsx, csv, pptx, txt)',
  '`.gd <folder link>` — pick a file from a public folder',
  '',
  '_The file must be shared as "Anyone with the link". You can also reply to a message that has the link._',
].join('\n');

function cleanOld() {
  try {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const f of fs.readdirSync(TMP)) {
      const p = path.join(TMP, f);
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  } catch { /* no folder yet */ }
}

async function showFolder(sock, chat, msg, ref) {
  reactMsg(sock, chat, msg.key, EMOJIS.SEARCH);
  const items = await listDriveFolder(ref.id);
  const shown = items.slice(0, 12);
  const rows = shown.map((it) => ({
    title: it.name,
    description: it.isFolder ? '📁 folder' : '📄 file',
    id: `gd https://drive.google.com/${it.isFolder ? 'drive/folders' : 'file/d'}/${it.id}${it.isFolder ? '' : '/view'}`,
  }));
  const more = items.length > shown.length ? `\n_Showing the first ${shown.length} of ${items.length}._` : '';
  const body = `📁 *Google Drive folder* — ${items.length} item${items.length === 1 ? '' : 's'}\n\nChoose one to download:${more}`;
  await sendInteractive(sock, chat, { body, footer: 'Al-Jin', buttons: [createSingleSelect('Select file', [{ title: 'Files', rows }])] }, { quoted: msg });
}

async function driveJob(sock, chat, msg, ref, format) {
  return queue.add(async () => {
    cleanOld();
    reactMsg(sock, chat, msg.key, EMOJIS.DOWNLOAD);
    const statusP = sock.sendMessage(chat, { text: '📁 *Google Drive* — connecting…' }, { quoted: msg }).catch(() => null);
    let status = null; statusP.then((s) => { status = s; });
    const prefix = `gd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let file = null;

    try {
      const dl = await openDriveDownload(ref, format);
      const cap = getMaxDownloadBytes();
      if (dl.size && dl.size > cap) {
        try { await dl.res.body?.cancel(); } catch {}
        throw new Error(`"${dl.name}" is ${MB(dl.size)} MB — over the ${getMaxDownloadMB()} MB cap. Raise it with \`.dlcap 1gb\``);
      }

      await statusP;
      const head = `📁 *${dl.name}*\n${dl.size ? `${MB(dl.size)} MB` : 'size unknown'}`;
      await editStatus(sock, chat, status, `${head}\n📥 Downloading 0% done...`);
      file = path.join(TMP, `${prefix}_${dl.name}`);
      let last = -1;
      const bytes = await saveResponse(dl.res, file, {
        maxBytes: cap, total: dl.size,
        onProgress: (p) => { if (p - last >= 10 || p === 100) { last = p; editStatus(sock, chat, status, `${head}\n📥 Downloading ${p}% done...`); } },
      });
      if (bytes < 1) throw new Error('the downloaded file is empty');

      reactMsg(sock, chat, msg.key, EMOJIS.UPLOAD);
      await editStatus(sock, chat, status, `${head}\nDownloading complete ✅ now sending`);

      const kind = kindOf(dl.mime);
      const ext = path.extname(dl.name).slice(1);
      const asDoc = bytes > getDocThresholdBytes();
      const src = { url: file };                      // streamed from disk, not loaded into RAM
      if (kind === 'image' && bytes <= IMAGE_LIMIT) {
        await sock.sendMessage(chat, { image: src, mimetype: dl.mime, caption: `📁 ${dl.name}` }, { quoted: msg });
      } else if (kind === 'video' && !asDoc && VIDEO_OK.test(ext)) {
        await sock.sendMessage(chat, { video: src, mimetype: dl.mime, fileName: dl.name, caption: `📁 ${dl.name}` }, { quoted: msg });
      } else if (kind === 'audio' && !asDoc) {
        await sock.sendMessage(chat, { audio: src, mimetype: dl.mime, fileName: dl.name, ptt: false }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { document: src, mimetype: dl.mime, fileName: dl.name }, { quoted: msg });
      }

      await editStatus(sock, chat, status, `✅ *Sent* — ${dl.name} (${MB(bytes)} MB)\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`);
      await reactMsg(sock, chat, msg.key, EMOJIS.SUCCESS);
    } catch (e) {
      console.error('[gd]', e?.message || e);
      await statusP;
      const m = /bigger than the download cap/.test(e?.message || '') ? `file is over the ${getMaxDownloadMB()} MB cap — raise it with \`.dlcap 1gb\`` : (e?.message || String(e));
      await editStatus(sock, chat, status, `❌ *Drive download failed:* ${m}`);
      await reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
    } finally {
      try { if (file) fs.unlinkSync(file); } catch {}
    }
  });
}

export async function gdCommand(sock, chat, msg, args) {
  const typed = argOrQuoted(msg, args);
  if (!typed) return sendWithCta(sock, chat, USAGE, { quoted: msg });

  const link = findDriveLink(typed);
  if (!link) {
    return sendWithCta(sock, chat, `❌ That is not a Google Drive link.\n\n${USAGE}`, { quoted: msg });
  }
  if (link.kind === 'form') {
    return sendWithCta(sock, chat, '❌ Google Forms cannot be downloaded.', { quoted: msg });
  }
  if (link.kind === 'folder') {
    try { return await showFolder(sock, chat, msg, link); } catch (e) {
      reactMsg(sock, chat, msg.key, EMOJIS.FAILED);
      return sendWithCta(sock, chat, `❌ *Drive folder:* ${e.message}`, { quoted: msg });
    }
  }
  // optional export format after the link (Docs / Sheets / Slides)
  const toks = typed.split(/\s+/);
  const after = toks[toks.indexOf(link.token) + 1] || '';
  const format = FORMAT_RE.test(after) ? after.toLowerCase() : '';
  return driveJob(sock, chat, msg, link, format);
}
