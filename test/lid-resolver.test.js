import assert from 'node:assert';
import {
  cacheLidPnMapping,
  getCachedPnForLid,
  getBestUserJidSync,
  getBestUserJid
} from '../core/jid-resolver.js';
import { vaultMediaName } from '../core/vault.js';

async function runTests() {
  console.log('Testing LID to PN resolution & caching...');

  const lidJid = '113383009419445@lid';
  const pnJid = '923257853673@s.whatsapp.net';

  // 1. Check sync before caching (should return LID)
  assert.strictEqual(getBestUserJidSync(lidJid), lidJid);

  // 2. Cache LID to PN mapping
  cacheLidPnMapping(lidJid, pnJid);
  assert.strictEqual(getCachedPnForLid(lidJid), pnJid);

  // 3. Check sync after caching (should return PN)
  assert.strictEqual(getBestUserJidSync(lidJid), pnJid);

  // 4. Check async getBestUserJid
  const bestJid = await getBestUserJid(lidJid);
  assert.strictEqual(bestJid, pnJid);

  // 5. Test vaultMediaName with cached PN
  const vaultName = vaultMediaName(lidJid, 'ghost', 'msg123', 'jpg');
  assert.strictEqual(vaultName, '923257853673_ghost_msg123.jpg');

  // 6. Test vaultMediaName with unmapped LID (falls back to LID digits)
  const unknownLid = '999999999999999@lid';
  const fallbackVaultName = vaultMediaName(unknownLid, 'ghost', 'msg456', 'jpg');
  assert.strictEqual(fallbackVaultName, '999999999999999_ghost_msg456.jpg');

  console.log('✅ All LID to PN resolution tests passed!');
}

runTests().catch(err => {
  console.error('❌ LID resolver test failed:', err);
  process.exit(1);
});
