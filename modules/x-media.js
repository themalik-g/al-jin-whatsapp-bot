// ─────────────────────────────────────────────
//  Al-Jin · modules/x-media.js     (ffmpeg only — no extra dependency)
//  stickers : take · stickercrop · circle · attp
//  images   : blur · greyscale · pixelate
//  audio/video : speed · treble · reverse · pitch · avm
//  documents: pdf
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import {
    reply, safe, findMedia, mediaBuffer, withTmp, ffmpeg, ffmpegHasFilter, quotedOf, senderJid, clamp, argOrQuoted, bytesToSize,
} from '../lib/x.js';
import { withStickerExif } from '../lib/webp-exif.js';
import { textToPdf, jpegsToPdf } from '../lib/pdf.js';
import { isAnimatedWebp } from '../lib/webp-anim.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();
const readOut = (p) => fs.readFileSync(p);
const STICKER_STATIC_MAX = 95 * 1024;
const STICKER_ANIM_MAX = 480 * 1024;

class UserError extends Error {}
const need = (cond, msg) => { if (!cond) throw new UserError(msg); };

function pushName(msg) { return String(msg.pushName || '').trim() || 'Al-Jin'; }

/** Sends a WebP buffer as a sticker carrying pack/author metadata. */
async function sendSticker(sock, chat, msg, webp, packName, author) {
    let out = webp;
    try { out = withStickerExif(webp, { packName, author }); } catch (e) { console.error('[x:sticker-exif]', e.message); }
    return sock.sendMessage(chat, { sticker: out }, { quoted: msg });
}

// ═════════ sticker encoding ═════════
const SQUARE_FIT = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
const SQUARE_CROP = 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba';

async function encodeSticker(inFile, outFile, { animated, crop, pre = '' }) {
    const vf = `${pre ? `${pre},` : ''}${crop ? SQUARE_CROP : SQUARE_FIT}`;
    const size = () => { try { return fs.statSync(outFile).size; } catch { return 0; } };
    if (!animated) {
        for (const q of [80, 60, 40, 25]) {
            await ffmpeg(['-i', inFile, '-vf', vf, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(q), '-an', outFile], 60000);
            if (size() <= STICKER_STATIC_MAX) return;
        }
        throw new UserError('the result is too large for a sticker');
    }
    for (const t of [{ fps: 12, q: 50, s: 8 }, { fps: 10, q: 35, s: 7 }, { fps: 8, q: 25, s: 6 }, { fps: 8, q: 15, s: 5 }]) {
        await ffmpeg(['-t', String(t.s), '-i', inFile, '-vf', `fps=${t.fps},${vf}`, '-c:v', 'libwebp', '-loop', '0', '-compression_level', '4', '-quality', String(t.q), '-an', outFile], 90000);
        if (size() <= STICKER_ANIM_MAX) return;
    }
    throw new UserError('the animation is too large for a sticker — try a shorter clip');
}

function stickerSource(msg, kinds = ['image', 'video', 'sticker']) {
    const m = findMedia(msg, kinds);
    need(m, 'Reply to a sticker, image or short video.');
    return m;
}

// ── take ───────────────────────────────────────
export const take = safe('take', async (sock, chat, msg, args) => {
    const m = findMedia(msg, ['sticker']);
    if (!m) return reply(sock, chat, msg, `🏷️ Reply to a sticker:\n\`${P()}take Pack name | Author\`\n\`${P()}take\` — uses “Al-Jin” and your name`);
    const raw = args.join(' ').trim();
    const [packRaw, ...authorParts] = raw ? raw.split('|') : [];
    const pack = (packRaw || '').trim() || 'Al-Jin';
    const author = authorParts.join('|').trim() || pushName(msg);
    const buf = await mediaBuffer(m, 3 * 1024 * 1024);
    return sendSticker(sock, chat, msg, buf, pack, author);
});

// ── stickercrop ────────────────────────────────
export const stickercrop = safe('stickercrop', async (sock, chat, msg) => {
    const m = stickerSource(msg);
    const buf = await mediaBuffer(m, 25 * 1024 * 1024);
    const animated = m.kind === 'video' || (m.kind === 'sticker' && isAnimatedWebp(buf)) || /gif/i.test(m.mime);
    need(!(m.kind === 'sticker' && animated), 'Animated stickers can’t be re-cropped — send the original video instead.');
    await withTmp([m.kind === 'video' ? '.mp4' : m.kind === 'sticker' ? '.webp' : '.img', '.webp'], async (inp, out) => {
        fs.writeFileSync(inp, buf);
        await encodeSticker(inp, out, { animated, crop: true });
        await sendSticker(sock, chat, msg, readOut(out), 'Al-Jin', pushName(msg));
    });
});

// ── circle ─────────────────────────────────────
export const circle = safe('circle', async (sock, chat, msg) => {
    const m = stickerSource(msg, ['image', 'sticker']);
    const buf = await mediaBuffer(m, 15 * 1024 * 1024);
    need(!(m.kind === 'sticker' && isAnimatedWebp(buf)), 'Animated stickers are not supported here.');
    await withTmp(['.img', '.webp'], async (inp, out) => {
        fs.writeFileSync(inp, buf);
        // square-crop to 512, then make everything outside the inscribed circle transparent
        const mask = "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-256,Y-256),256),255,0)'";
        for (const q of [80, 55, 35]) {
            await ffmpeg(['-i', inp, '-vf', `${SQUARE_CROP},${mask}`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(q), '-an', out], 60000);
            if (fs.statSync(out).size <= STICKER_STATIC_MAX) break;
        }
        await sendSticker(sock, chat, msg, readOut(out), 'Al-Jin', pushName(msg));
    });
});

// ── attp (animated text sticker) ───────────────
const FONT_CANDIDATES = [
    process.env.ATTP_FONT,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/noto/NotoSans-Bold.ttf',
    '/system/fonts/Roboto-Bold.ttf', '/system/fonts/DroidSans-Bold.ttf', '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf',
].filter(Boolean);
const findFont = () => FONT_CANDIDATES.find((f) => { try { return fs.existsSync(f); } catch { return false; } });
const filterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

function wrapText(text, width = 11) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    const lines = []; let cur = '';
    for (const w of words) {
        if (!cur) cur = w;
        else if ((cur + ' ' + w).length <= width) cur += ` ${w}`;
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.flatMap((l) => (l.length > width ? l.match(new RegExp(`.{1,${width}}`, 'g')) : [l])).slice(0, 7);
}

export const attp = safe('attp', async (sock, chat, msg, args) => {
    const text = argOrQuoted(msg, args).slice(0, 80);
    if (!text) return reply(sock, chat, msg, `🔤 Usage: \`${P()}attp Hello world\` — animated text sticker`);
    const font = findFont();
    if (!font || !(await ffmpegHasFilter('drawtext'))) {
        return reply(sock, chat, msg, '⚠️ This server’s FFmpeg has no text renderer or no font installed.\nInstall a font (e.g. `apt install fonts-dejavu-core`) or set `ATTP_FONT=/path/to/font.ttf`.');
    }
    const lines = wrapText(text);
    const colors = ['ff3b30', 'ff9500', 'ffd60a', '34c759', '0a84ff', 'bf5af2'];
    // fit the longest line inside ~470px (bold sans ≈ 0.68em per glyph) and all lines inside ~470px of height
    const longest = Math.max(...lines.map((l) => l.length));
    const fontSize = clamp(Math.floor(Math.min(470 / (longest * 0.68), 470 / (lines.length * 1.3))), 28, 110);
    await withTmp(['.txt', '.webp'], async (txt, out) => {
        fs.writeFileSync(txt, lines.join('\n'), 'utf8');
        const step = 0.2;
        const draws = colors.map((c, i) => `drawtext=fontfile='${filterPath(font)}':textfile='${filterPath(txt)}':fontcolor=0x${c}:fontsize=${fontSize}:line_spacing=8:x=(w-text_w)/2:y=(h-text_h)/2:borderw=4:bordercolor=black@0.85:enable='between(t,${(i * step).toFixed(1)},${((i + 1) * step - 0.001).toFixed(3)})'`);
        await ffmpeg(['-f', 'lavfi', '-i', `color=c=black@0.0:s=512x512:r=10:d=${(colors.length * step).toFixed(1)},format=rgba`, '-vf', draws.join(','), '-c:v', 'libwebp', '-loop', '0', '-lossless', '0', '-quality', '55', '-an', out], 60000);
        await sendSticker(sock, chat, msg, readOut(out), 'Al-Jin', pushName(msg));
    });
});

// ═════════ image effects ═════════
async function imageEffect(sock, chat, msg, name, vfBuilder) {
    const m = findMedia(msg, ['image', 'sticker']);
    if (!m) return reply(sock, chat, msg, `Reply to an image with \`${P()}${name}\`.`);
    const buf = await mediaBuffer(m, 20 * 1024 * 1024);
    need(!(m.kind === 'sticker' && isAnimatedWebp(buf)), 'Animated stickers are not supported here.');
    await withTmp(['.img', '.jpg'], async (inp, out) => {
        fs.writeFileSync(inp, buf);
        await ffmpeg(['-i', inp, '-vf', vfBuilder(), '-frames:v', '1', '-q:v', '3', out], 60000);
        await sock.sendMessage(chat, { image: readOut(out) }, { quoted: msg });
    });
}
export const blur = safe('blur', (sock, chat, msg, args) => {
    const n = clamp(parseInt(args[0], 10) || 8, 1, 40);
    return imageEffect(sock, chat, msg, 'blur', () => `scale='min(1280,iw)':-2,gblur=sigma=${n}`);
});
export const greyscale = safe('greyscale', (sock, chat, msg) => imageEffect(sock, chat, msg, 'greyscale', () => 'scale=\'min(1600,iw)\':-2,hue=s=0'));
export const pixelate = safe('pixelate', (sock, chat, msg, args) => {
    const n = clamp(parseInt(args[0], 10) || 24, 4, 120);
    return imageEffect(sock, chat, msg, 'pixelate', () => `scale='min(1280,iw)':-2,scale=trunc(iw/${n}/2)*2:trunc(ih/${n}/2)*2:flags=area,scale=trunc(iw*${n}/2)*2:trunc(ih*${n}/2)*2:flags=neighbor`);
});

// ═════════ audio / video ═════════
const atempoChain = (f) => {
    const out = [];
    while (f > 2) { out.push('atempo=2'); f /= 2; }
    while (f < 0.5) { out.push('atempo=0.5'); f /= 0.5; }
    out.push(`atempo=${f.toFixed(4)}`);
    return out.join(',');
};

async function avFilter(sock, chat, msg, name, build, { maxSeconds = 600 } = {}) {
    const m = findMedia(msg, ['audio', 'video']);
    if (!m) return reply(sock, chat, msg, `Reply to an audio message or video with \`${P()}${name}\`.`);
    const secs = Number(m.node.seconds || 0);
    need(!secs || secs <= maxSeconds, `Too long for this effect (max ${Math.round(maxSeconds / 60)} min).`);
    const buf = await mediaBuffer(m, 60 * 1024 * 1024);
    const isVideo = m.kind === 'video';
    await withTmp([isVideo ? '.mp4' : '.audio', isVideo ? '.mp4' : '.mp3'], async (inp, out) => {
        fs.writeFileSync(inp, buf);
        const { args: fa, video } = build(isVideo);
        const argv = ['-i', inp];
        if (isVideo) {
            if (video) argv.push('-vf', video);
            argv.push('-af', fa, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);
        } else {
            argv.push('-vn', '-af', fa, '-c:a', 'libmp3lame', '-b:a', '128k', out);
        }
        await ffmpeg(argv, 180000);
        const data = readOut(out);
        await sock.sendMessage(chat, isVideo ? { video: data } : { audio: data, mimetype: 'audio/mpeg' }, { quoted: msg });
    });
}

export const speed = safe('speed', (sock, chat, msg, args) => {
    const f = parseFloat(args[0]);
    if (!(f >= 0.25 && f <= 4)) return reply(sock, chat, msg, `⏩ Usage: reply to audio/video with \`${P()}speed 1.5\` (0.25 – 4)`);
    return avFilter(sock, chat, msg, 'speed', () => ({ args: atempoChain(f), video: `setpts=${(1 / f).toFixed(4)}*PTS` }));
});

export const treble = safe('treble', (sock, chat, msg, args) => {
    const g = clamp(parseInt(args[0], 10) || 12, -20, 20);
    return avFilter(sock, chat, msg, 'treble', () => ({ args: `treble=g=${g}:f=3500`, video: null }));
});

export const reverse = safe('reverse', (sock, chat, msg) =>
    avFilter(sock, chat, msg, 'reverse', (isVideo) => ({ args: 'areverse', video: isVideo ? 'reverse' : null }), { maxSeconds: 45 }));

export const pitch = safe('pitch', (sock, chat, msg, args) => {
    const st = parseFloat(args[0]);
    if (!(st >= -12 && st <= 12) || st === 0) return reply(sock, chat, msg, `🎚️ Usage: reply to audio/video with \`${P()}pitch 4\` (semitones, −12 … +12)`);
    const ratio = 2 ** (st / 12);
    return avFilter(sock, chat, msg, 'pitch', () => ({ args: `asetrate=44100*${ratio.toFixed(5)},aresample=44100,${atempoChain(1 / ratio)}`, video: null }));
});

// audio → video with a waveform picture
export const avm = safe('avm', async (sock, chat, msg) => {
    const m = findMedia(msg, ['audio']);
    if (!m) return reply(sock, chat, msg, `🎬 Reply to an audio message or voice note with \`${P()}avm\` to get a waveform video.`);
    need(!m.node.seconds || m.node.seconds <= 300, 'Audio is longer than 5 minutes.');
    const buf = await mediaBuffer(m, 30 * 1024 * 1024);
    await withTmp(['.audio', '.mp4'], async (inp, out) => {
        fs.writeFileSync(inp, buf);
        await ffmpeg(['-i', inp, '-filter_complex', '[0:a]showwaves=s=720x720:mode=cline:rate=25:colors=0x25d366,format=yuv420p[v]', '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], 240000);
        await sock.sendMessage(chat, { video: readOut(out), caption: '🎬' }, { quoted: msg });
    });
});

// ═════════ pdf ═════════
const pdfQueues = new Map(); // sender → { jpegs:[Buffer], at }
async function toJpeg(buf) {
    return withTmp(['.img', '.jpg'], async (inp, out) => {
        fs.writeFileSync(inp, buf);
        await ffmpeg(['-i', inp, '-vf', "scale='min(1700,iw)':'min(2400,ih)':force_original_aspect_ratio=decrease,format=yuvj420p", '-frames:v', '1', '-q:v', '3', out], 60000);
        return readOut(out);
    });
}
async function sendPdf(sock, chat, msg, pdf, name, pages, note = '') {
    const fileName = `${String(name || 'document').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'document'}.pdf`;
    await sock.sendMessage(chat, { document: pdf, mimetype: 'application/pdf', fileName, caption: `📄 ${pages} page${pages === 1 ? '' : 's'} · ${bytesToSize(pdf.length)}${note}` }, { quoted: msg });
}

export const pdf = safe('pdf', async (sock, chat, msg, args) => {
    const who = senderJid(msg);
    const sub = (args[0] || '').toLowerCase();
    const q = pdfQueues.get(who);
    if (sub === 'add') {
        const m = findMedia(msg, ['image']);
        if (!m) return reply(sock, chat, msg, `Reply to a photo with \`${P()}pdf add\`.`);
        const cur = q && Date.now() - q.at < 30 * 60000 ? q : { jpegs: [], at: Date.now() };
        if (cur.jpegs.length >= 20) return reply(sock, chat, msg, 'Maximum of 20 pages reached — run `.pdf make`.');
        cur.jpegs.push(await toJpeg(await mediaBuffer(m, 20 * 1024 * 1024))); cur.at = Date.now();
        pdfQueues.set(who, cur);
        if (pdfQueues.size > 200) pdfQueues.delete(pdfQueues.keys().next().value);
        return reply(sock, chat, msg, `➕ page ${cur.jpegs.length} added. More: \`${P()}pdf add\` · finish: \`${P()}pdf make [name]\``);
    }
    if (sub === 'clear') { pdfQueues.delete(who); return reply(sock, chat, msg, '🗑️ pdf queue cleared.'); }
    if (sub === 'make') {
        if (!q?.jpegs.length) return reply(sock, chat, msg, `Nothing queued. Add photos with \`${P()}pdf add\`.`);
        const name = args.slice(1).join(' ');
        const { pdf: out, pages } = jpegsToPdf(q.jpegs, { title: name || 'Images' });
        pdfQueues.delete(who);
        return sendPdf(sock, chat, msg, out, name || 'images', pages);
    }
    // direct: reply to an image, or text
    const img = findMedia(msg, ['image']);
    if (img) {
        const { pdf: out, pages } = jpegsToPdf([await toJpeg(await mediaBuffer(img, 20 * 1024 * 1024))], { title: args.join(' ') || 'Image' });
        return sendPdf(sock, chat, msg, out, args.join(' ') || 'image', pages);
    }
    const text = argOrQuoted(msg, args);
    if (!text) {
        return reply(sock, chat, msg, [
            '📄 *pdf*', '',
            `\`${P()}pdf <text>\` or reply to a text → text PDF`,
            `reply to a photo with \`${P()}pdf\` → 1-page PDF`,
            `\`${P()}pdf add\` (reply to photos) then \`${P()}pdf make [name]\` → multi-page`,
        ].join('\n'));
    }
    const first = text.split('\n')[0].slice(0, 40);
    const { pdf: out, pages, lossy } = textToPdf(text, { title: first });
    return sendPdf(sock, chat, msg, out, first, pages, lossy ? '\n⚠️ Characters outside Latin-1 (e.g. Arabic/Urdu/emoji) were replaced with “?”. Send those as photos with .pdf add.' : '');
});

void path; void quotedOf;
