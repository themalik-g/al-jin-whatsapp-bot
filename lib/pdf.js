// ─────────────────────────────────────────────
//  Al-Jin · lib/pdf.js
//  Minimal PDF 1.4 writer — zero dependencies.
//    · text documents  (Helvetica, Latin-1 characters, automatic wrapping/paging)
//    · image documents (JPEG data embedded as-is, one image per page)
// ─────────────────────────────────────────────

const A4 = [595.28, 841.89];

// Helvetica advance widths for ASCII 32..126 (1000 units/em)
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

const charW = (c, size) => ((c >= 32 && c <= 126 ? HELV[c - 32] : 556) * size) / 1000;
const fix = (n) => (Math.round(n * 100) / 100).toString();

/** Replace characters outside Latin-1 and report whether anything was lost. */
export function toLatin1(text) {
    let lost = false;
    const out = String(text).replace(/\r/g, '').replace(/\t/g, '    ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
        .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
        .replace(/[^\n\x20-\x7e\xa0-\xff]/gu, () => { lost = true; return '?'; });
    return { text: out, lost };
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

class Doc {
    constructor() { this.objs = []; }
    add(body) { this.objs.push(body); return this.objs.length; }          // returns object number
    reserve() { this.objs.push(null); return this.objs.length; }
    set(n, body) { this.objs[n - 1] = body; }
    build(rootNum, infoNum) {
        const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
        const offsets = [];
        let pos = parts[0].length;
        this.objs.forEach((body, i) => {
            const b = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1');
            const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
            const tail = Buffer.from('\nendobj\n', 'latin1');
            offsets.push(pos);
            parts.push(head, b, tail);
            pos += head.length + b.length + tail.length;
        });
        const xref = [`xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`];
        for (const o of offsets) xref.push(`${String(o).padStart(10, '0')} 00000 n \n`);
        xref.push(`trailer\n<< /Size ${this.objs.length + 1} /Root ${rootNum} 0 R${infoNum ? ` /Info ${infoNum} 0 R` : ''} >>\nstartxref\n${pos}\n%%EOF\n`);
        parts.push(Buffer.from(xref.join(''), 'latin1'));
        return Buffer.concat(parts);
    }
}

function streamObj(dict, data) {
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    return Buffer.concat([Buffer.from(`<< ${dict} /Length ${d.length} >>\nstream\n`, 'latin1'), d, Buffer.from('\nendstream', 'latin1')]);
}

function finish(doc, pageNums, title) {
    const pagesNum = doc.reserve();
    const catalog = doc.add(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);
    const info = doc.add(`<< /Title (${esc(toLatin1(title || 'Document').text)}) /Producer (Al-Jin) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`);
    doc.set(pagesNum, `<< /Type /Pages /Count ${pageNums.length} /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] >>`);
    return doc.build(catalog, info);
}

/** Word-wrap `text` to `maxWidth` points using Helvetica metrics. */
function wrap(text, size, maxWidth) {
    const lines = [];
    for (const para of text.split('\n')) {
        if (!para.trim()) { lines.push(''); continue; }
        let line = '', w = 0;
        for (const word of para.split(/( +)/)) {
            const ww = [...word].reduce((s, ch) => s + charW(ch.charCodeAt(0), size), 0);
            if (w + ww > maxWidth && line.trim()) { lines.push(line.replace(/ +$/, '')); line = ''; w = 0; if (/^ +$/.test(word)) continue; }
            if (ww > maxWidth) { // very long token: hard-split
                for (const ch of word) {
                    const cw = charW(ch.charCodeAt(0), size);
                    if (w + cw > maxWidth) { lines.push(line); line = ''; w = 0; }
                    line += ch; w += cw;
                }
                continue;
            }
            line += word; w += ww;
        }
        lines.push(line.replace(/ +$/, ''));
    }
    return lines;
}

/** @returns {{ pdf: Buffer, pages: number, lossy: boolean }} */
export function textToPdf(input, { title = 'Document', size = 11 } = {}) {
    const { text, lost } = toLatin1(input);
    const margin = 56, lead = size * 1.45;
    const [W, H] = A4;
    const lines = wrap(text, size, W - margin * 2);
    const perPage = Math.floor((H - margin * 2) / lead);
    const doc = new Doc();
    const font = doc.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const pageNums = [];
    for (let i = 0; i < Math.max(lines.length, 1); i += perPage) {
        const slice = lines.slice(i, i + perPage);
        const ops = [`BT /F1 ${size} Tf ${fix(lead)} TL ${margin} ${fix(H - margin - size)} Td`];
        for (const l of slice) ops.push(`(${esc(l)}) Tj T*`);
        ops.push('ET');
        const content = doc.add(streamObj('', Buffer.from(ops.join('\n'), 'latin1')));
        pageNums.push(doc.add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${fix(W)} ${fix(H)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    const pdf = fixParents(doc, pageNums, title);
    return { pdf, pages: pageNums.length, lossy: lost };
}

// Pages reference /Parent before the Pages object exists; patch the number in once known.
function fixParents(doc, pageNums, title) {
    const pagesNum = doc.objs.length + 1; // finish() reserves the Pages object next
    for (const n of pageNums) doc.set(n, String(doc.objs[n - 1]).replace('/Parent 0 0 R', `/Parent ${pagesNum} 0 R`));
    return finish(doc, pageNums, title);
}

/** Reads width/height/components from a baseline or progressive JPEG. */
export function jpegInfo(buf) {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
    let p = 2;
    while (p + 9 < buf.length) {
        if (buf[p] !== 0xff) { p++; continue; }
        const m = buf[p + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
        const len = buf.readUInt16BE(p + 2);
        if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
            return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7), comps: buf[p + 9] };
        }
        p += 2 + len;
    }
    throw new Error('JPEG size not found');
}

/** One JPEG per A4 page, scaled to fit with a margin. */
export function jpegsToPdf(jpegs, { title = 'Images', margin = 24 } = {}) {
    const [W, H] = A4;
    const doc = new Doc();
    const pageNums = [];
    jpegs.forEach((jpg, idx) => {
        const { w, h, comps } = jpegInfo(jpg);
        const cs = comps === 1 ? '/DeviceGray' : comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
        const decode = comps === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
        const img = doc.add(streamObj(`/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${decode}`, jpg));
        const scale = Math.min((W - margin * 2) / w, (H - margin * 2) / h);
        const dw = w * scale, dh = h * scale;
        const x = (W - dw) / 2, y = (H - dh) / 2;
        const content = doc.add(streamObj('', `q ${fix(dw)} 0 0 ${fix(dh)} ${fix(x)} ${fix(y)} cm /Im${idx} Do Q`));
        pageNums.push(doc.add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${fix(W)} ${fix(H)}] /Resources << /XObject << /Im${idx} ${img} 0 R >> >> /Contents ${content} 0 R >>`));
    });
    return { pdf: fixParents(doc, pageNums, title), pages: pageNums.length };
}
