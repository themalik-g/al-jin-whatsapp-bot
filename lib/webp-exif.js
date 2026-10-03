// ─────────────────────────────────────────────
//  Al-Jin · lib/webp-exif.js
//  Writes WhatsApp sticker metadata (pack name + author) into a WebP file.
//  Pure JavaScript, no dependencies. Handles still, alpha and animated WebP.
//
//  WhatsApp reads a RIFF "EXIF" chunk containing a tiny TIFF header followed
//  by a JSON document with the keys below.
// ─────────────────────────────────────────────
import crypto from 'node:crypto';

const u32 = (b, o) => b.readUInt32LE(o);
const tag = (b, o) => b.toString('ascii', o, o + 4);

function chunk(fourcc, data) {
    const pad = data.length & 1 ? Buffer.from([0]) : Buffer.alloc(0);
    const head = Buffer.alloc(8);
    head.write(fourcc, 0, 'ascii');
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, pad]);
}

/** Build the EXIF payload WhatsApp expects. */
export function buildStickerExif({ packName = 'Al-Jin', author = '', packId, emojis = [] } = {}) {
    const json = Buffer.from(JSON.stringify({
        'sticker-pack-id': packId || crypto.randomUUID(),
        'sticker-pack-name': String(packName).slice(0, 60),
        'sticker-pack-publisher': String(author).slice(0, 60),
        emojis,
    }), 'utf8');
    const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    tiff.writeUInt32LE(json.length, 14);
    return Buffer.concat([tiff, json]);
}

/** Width / height / alpha of a "simple" (non-VP8X) WebP bitstream chunk. */
function bitstreamInfo(fourcc, d) {
    if (fourcc === 'VP8 ') {
        return { w: d.readUInt16LE(6) & 0x3fff, h: d.readUInt16LE(8) & 0x3fff, alpha: false };
    }
    if (fourcc === 'VP8L') {
        const b = d.readUInt32LE(1);
        return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1, alpha: ((b >>> 28) & 1) === 1 };
    }
    throw new Error('unsupported WebP bitstream');
}

/**
 * Returns a copy of `webp` carrying the sticker metadata.
 * Any existing EXIF chunk is replaced.
 */
export function withStickerExif(webp, meta) {
    if (!Buffer.isBuffer(webp) || webp.length < 20 || tag(webp, 0) !== 'RIFF' || tag(webp, 8) !== 'WEBP') {
        throw new Error('not a WebP file');
    }
    const end = Math.min(webp.length, u32(webp, 4) + 8);
    const chunks = [];
    for (let pos = 12; pos + 8 <= end;) {
        const id = tag(webp, pos);
        const size = u32(webp, pos + 4);
        if (pos + 8 + size > webp.length) throw new Error('truncated WebP');
        chunks.push({ id, data: webp.subarray(pos + 8, pos + 8 + size) });
        pos += 8 + size + (size & 1);
    }
    if (!chunks.length) throw new Error('empty WebP');

    let rest = chunks.filter((c) => c.id !== 'EXIF');
    let vp8x;
    if (rest[0].id === 'VP8X') {
        vp8x = Buffer.from(rest[0].data);
        vp8x[0] |= 0x08;                       // EXIF present
        rest = rest.slice(1);
    } else {
        const img = rest.find((c) => c.id === 'VP8 ' || c.id === 'VP8L');
        if (!img) throw new Error('no image data in WebP');
        const { w, h, alpha } = bitstreamInfo(img.id, img.data);
        vp8x = Buffer.alloc(10);
        vp8x[0] = 0x08 | (alpha ? 0x10 : 0);
        vp8x.writeUIntLE(w - 1, 4, 3);
        vp8x.writeUIntLE(h - 1, 7, 3);
    }

    const body = Buffer.concat([
        Buffer.from('WEBP', 'ascii'),
        chunk('VP8X', vp8x),
        ...rest.map((c) => chunk(c.id, c.data)),
        chunk('EXIF', buildStickerExif(meta)),
    ]);
    const head = Buffer.alloc(8);
    head.write('RIFF', 0, 'ascii');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body]);
}

/** Reads back { packName, author } if the WebP carries sticker metadata (used by tests / `take`). */
export function readStickerExif(webp) {
    try {
        const end = Math.min(webp.length, u32(webp, 4) + 8);
        for (let pos = 12; pos + 8 <= end;) {
            const id = tag(webp, pos);
            const size = u32(webp, pos + 4);
            if (id === 'EXIF') {
                const raw = webp.subarray(pos + 8 + 22, pos + 8 + size).toString('utf8');
                const j = JSON.parse(raw);
                return { packName: j['sticker-pack-name'], author: j['sticker-pack-publisher'], packId: j['sticker-pack-id'] };
            }
            pos += 8 + size + (size & 1);
        }
    } catch {}
    return null;
}
