// ─────────────────────────────────────────────
// Al-Jin · scripts/apply-baileys-patch.js
// Applies a tiny, reversible fix to the installed Baileys (7.0.0-rc.14):
//   decrypt retry with the stanza's alternate LID/PN identity
//   (backport of WhiskeySockets/Baileys PR #2763 — fixes "Waiting for this message"
//   on the bot's own phone caused by LID↔PN session mismatches).
//
// Safe by design:
//   • runs automatically after `npm install` and before `npm start`
//   • idempotent — does nothing if already applied
//   • only replaces the file when it is byte-identical to the known rc.14 original
//   • keeps a backup (decode-wa-message.js.orig)
//   • never throws / never fails the install; it just prints what it did
// Manual run:  node scripts/apply-baileys-patch.js        (undo: --revert)
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = path.join(ROOT, 'node_modules', '@whiskeysockets', 'baileys');
const TARGET = path.join(PKG_DIR, 'lib', 'Utils', 'decode-wa-message.js');
const BACKUP = `${TARGET}.orig`;
const PATCHED = path.join(ROOT, 'patches', 'baileys-rc14', 'decode-wa-message.js');
const MARKER = 'ALJIN-PATCH:LID-PN-RETRY';
const ORIGINAL_SHA256 = 'ddd2f90e538b509e83a80a3e5198feced0337240885f0abf75c7352a34afe7cc';

const say = (m) => console.log(`[baileys-patch] ${m}`);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function main() {
  if (!fs.existsSync(TARGET)) return say('Baileys is not installed yet — skipped.');

  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')).version || ''; } catch {}
  const current = fs.readFileSync(TARGET);

  if (process.argv.includes('--revert')) {
    if (!fs.existsSync(BACKUP)) return say('no backup found — nothing to revert.');
    fs.copyFileSync(BACKUP, TARGET);
    return say('reverted to the original Baileys file.');
  }

  if (current.toString('utf8').includes(MARKER)) return say(`already applied (Baileys ${version}).`);

  if (!/^7\.0\.0-rc\.?14$/.test(version)) {
    return say(`Baileys ${version || 'unknown'} is not 7.0.0-rc.14 — skipped (newer versions may already include the fix).`);
  }
  if (sha(current) !== ORIGINAL_SHA256) {
    return say('installed file differs from the known rc.14 original — skipped to stay safe.');
  }
  if (!fs.existsSync(PATCHED)) return say('patch file missing (patches/baileys-rc14/decode-wa-message.js) — skipped.');

  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, current);
  fs.writeFileSync(TARGET, fs.readFileSync(PATCHED));
  say('applied: decrypt now retries with the alternate LID/PN identity. Restart the bot.');
}

try { main(); } catch (e) { say(`skipped (${e?.message || e})`); }
