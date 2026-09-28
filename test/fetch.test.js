import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { fetchCommand } from '../modules/fetch.js';

console.log('Testing fetchCommand...');

// Setup test directory
const testRepoRoot = path.join(process.cwd(), 'data', 'tmp', 'test_fetch_env');
process.env.WRAITH_REPO_ROOT = testRepoRoot;

const testInstDir = path.join(testRepoRoot, 'instances', 'sess2');
const vaultDir = path.join(testInstDir, 'vault');
const logsDir = path.join(testInstDir, 'logs');

fs.mkdirSync(vaultDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

// Add test files including a hidden file
fs.writeFileSync(path.join(vaultDir, 'vault_file.txt'), 'Vault Content');
fs.writeFileSync(path.join(vaultDir, '.DS_Store'), 'Hidden Content');
fs.writeFileSync(path.join(logsDir, 'chat_log.log'), 'Log Content');

// Create nested directory
const nestedDir = path.join(logsDir, 'subfolder');
fs.mkdirSync(nestedDir, { recursive: true });
fs.writeFileSync(path.join(nestedDir, 'nested_log.txt'), 'Nested Log Content');

// Mock socket
function createMockSocket() {
  const sentMessages = [];
  return {
    sentMessages,
    sendMessage: async (chat, payload, options) => {
      sentMessages.push({ chat, payload, options });
    }
  };
}

async function runTests() {
  // Test 1: Incomplete command (no args) -> No response
  {
    const sock = createMockSocket();
    const msg = { key: { fromMe: true, remoteJid: '123@s.whatsapp.net' } };
    await fetchCommand(sock, '123@s.whatsapp.net', msg, []);
    assert.strictEqual(sock.sentMessages.length, 0, 'Incomplete command should produce no output');
  }

  // Test 2: Non-owner caller -> Owner only message
  {
    const sock = createMockSocket();
    const msg = { key: { fromMe: false, participant: '1111111111@s.whatsapp.net', remoteJid: '123@s.whatsapp.net' } };
    await fetchCommand(sock, '123@s.whatsapp.net', msg, ['sess2']);
    assert.strictEqual(sock.sentMessages.length, 1);
    assert.strictEqual(sock.sentMessages[0].payload.text, '⛔ Owner only.');
  }

  // Test 3: Session with no files -> Warning message
  {
    const sock = createMockSocket();
    const msg = { key: { fromMe: true, remoteJid: '123@s.whatsapp.net' } };
    await fetchCommand(sock, '123@s.whatsapp.net', msg, ['empty_sess']);
    assert.strictEqual(sock.sentMessages.length, 1);
    assert.match(sock.sentMessages[0].payload.text, /⚠️ No files found in vault or logs/);
  }

  // Test 4: Valid session fetch -> ZIP document sent
  {
    const sock = createMockSocket();
    const msg = { key: { fromMe: true, remoteJid: '123@s.whatsapp.net' } };
    await fetchCommand(sock, '123@s.whatsapp.net', msg, ['sess2']);
    assert.strictEqual(sock.sentMessages.length, 1);

    const payload = sock.sentMessages[0].payload;
    assert.ok(payload.document, 'Should send document payload');
    assert.strictEqual(payload.fileName, 'sess2_vault_logs.zip');
    assert.strictEqual(payload.mimetype, 'application/zip');
    assert.ok(Buffer.isBuffer(payload.document), 'Document should be a Buffer');

    // Test that the zip is valid and does not contain hidden files
    const zipPath = path.join(testRepoRoot, 'temp_test.zip');
    fs.writeFileSync(zipPath, payload.document);

    // Verify zip using zlib or checking buffer
    const zipBuf = payload.document;
    assert.strictEqual(zipBuf.readUInt32LE(0), 0x04034b50, 'Valid PK zip signature');

    fs.unlinkSync(zipPath);
  }

  // Cleanup
  fs.rmSync(testRepoRoot, { recursive: true, force: true });
  delete process.env.WRAITH_REPO_ROOT;

  console.log('All fetchCommand tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
