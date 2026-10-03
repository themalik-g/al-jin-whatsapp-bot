// ─────────────────────────────────────────────
// Al-Jin · test/x-extras.test.js
// Offline unit tests for the extras pack (modules/x-*.js, lib/pdf.js, lib/webp-exif.js)
// Run:  node --test test/x-extras.test.js
// ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WRAITH_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'aljin-x-'));

const { evaluate } = await import('../modules/x-tools.js');
const { textToPdf, jpegInfo, toLatin1 } = await import('../lib/pdf.js');
const { withStickerExif, readStickerExif, buildStickerExif } = await import('../lib/webp-exif.js');
const { extraVerbs, extraTable, hasExtra } = await import('../modules/x-registry.js');
const { X_DETAILS, X_MENU } = await import('../modules/x-details.js');

test('calc: precedence, functions, postfix operators', () => {
  assert.equal(evaluate('12*(3+4)^2'), 588);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('sqrt(16)+5!'), 124);
  assert.equal(evaluate('50%+1'), 1.5);
  assert.equal(evaluate('10÷4'), 2.5);
  assert.ok(Math.abs(evaluate('sin(pi/2)') - 1) < 1e-12);
});

test('calc: rejects code and bad input (no eval)', () => {
  for (const bad of ['process.exit()', 'require("fs")', '1/0', '2+', '(1', 'abc', '171!', '']) {
    assert.throws(() => evaluate(bad), undefined, bad);
  }
});

test('pdf: text document is a valid, multi-page PDF', () => {
  const { pdf, pages, lossy } = textToPdf('Lorem ipsum dolor sit amet. '.repeat(600), { title: 'T' });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.toString('latin1').trimEnd().endsWith('%%EOF'));
  assert.ok(pages >= 2);
  assert.equal(lossy, false);
  const startxref = Number(/startxref\n(\d+)/.exec(pdf.toString('latin1'))[1]);
  assert.equal(pdf.toString('latin1', startxref, startxref + 4), 'xref');
});

test('pdf: non-Latin-1 text is flagged as lossy', () => {
  assert.equal(toLatin1('سلام').lost, true);
  assert.equal(toLatin1('café – “ok”').lost, false);
});

test('pdf: jpegInfo rejects non-JPEG', () => {
  assert.throws(() => jpegInfo(Buffer.from('nope')), /JPEG/);
});

// minimal valid lossy WebP header (1x1) — enough for the RIFF/EXIF writer
function tinyWebp() {
  const vp8 = Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
  const chunk = Buffer.concat([Buffer.from('VP8 '), Buffer.from([vp8.length, 0, 0, 0]), vp8]);
  const body = Buffer.concat([Buffer.from('WEBP'), chunk]);
  const head = Buffer.alloc(8); head.write('RIFF'); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

test('webp-exif: writes and reads back sticker metadata, replaces old EXIF', () => {
  const once = withStickerExif(tinyWebp(), { packName: 'Pack', author: 'Me' });
  assert.deepEqual({ ...readStickerExif(once), packId: undefined }, { packName: 'Pack', author: 'Me', packId: undefined });
  const twice = withStickerExif(once, { packName: 'Other', author: 'You' });
  assert.equal(readStickerExif(twice).packName, 'Other');
  assert.equal(twice.toString('latin1').split('EXIF').length - 1, 1, 'exactly one EXIF chunk');
  assert.equal(twice.readUInt32LE(4) + 8, twice.length, 'RIFF size matches');
});

test('webp-exif: exif payload carries the expected TIFF header length', () => {
  const ex = buildStickerExif({ packName: 'A', author: 'B' });
  assert.equal(ex.readUInt32LE(14), ex.length - 22);
});

test('registry: no duplicate verbs, every verb has details, menu is well-formed', () => {
  const seen = new Set();
  for (const { verb, aliases } of extraTable()) {
    for (const v of [verb, ...aliases]) { assert.ok(!seen.has(v), `duplicate verb ${v}`); seen.add(v); }
    assert.ok(X_DETAILS[verb], `missing .details entry for ${verb}`);
  }
  assert.equal(seen.size, extraVerbs().length);
  assert.ok(hasExtra('ttt') && hasExtra('antibadword'));
  for (const cat of X_MENU) {
    assert.ok(cat.id && cat.title && cat.commands.length);
    for (const c of cat.commands) assert.match(c.cmd, /^\./);
  }
});
