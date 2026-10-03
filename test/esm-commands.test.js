// test/esm-commands.test.js
import assert from 'node:assert';
import { test } from 'node:test';
import { getEsmApiKey, fetchEsmApi } from '../lib/esm.js';
import { jindlCommand, jinvideoCommand, jinytsearchCommand, jinimageCommand, jinaiCommand, jinapkCommand } from '../modules/esm-commands.js';

test('ESM API helper module', async () => {
  const key = getEsmApiKey();
  assert.strictEqual(typeof key, 'string');
  assert.ok(key.length > 0);
});

test('ESM commands module exports', () => {
  assert.strictEqual(typeof jindlCommand, 'function');
  assert.strictEqual(typeof jinvideoCommand, 'function');
  assert.strictEqual(typeof jinytsearchCommand, 'function');
  assert.strictEqual(typeof jinimageCommand, 'function');
  assert.strictEqual(typeof jinaiCommand, 'function');
  assert.strictEqual(typeof jinapkCommand, 'function');
});

test('ESM commands usage responses without args', async () => {
  const sent = [];
  const mockSock = {
    sendMessage: async (chat, content) => {
      sent.push({ chat, content });
      return { key: { id: 'mock123' } };
    }
  };
  const msg = { key: { remoteJid: '12345@s.whatsapp.net' } };

  await jindlCommand(mockSock, '12345@s.whatsapp.net', msg, []);
  assert.ok(sent[0].content.text.includes('Usage: `.jindl'));

  await jinvideoCommand(mockSock, '12345@s.whatsapp.net', msg, []);
  assert.ok(sent[1].content.text.includes('Usage: `.jinvideo'));

  await jinytsearchCommand(mockSock, '12345@s.whatsapp.net', msg, []);
  assert.ok(sent[2].content.text.includes('Usage: `.jinytsearch'));

  await jinimageCommand(mockSock, '12345@s.whatsapp.net', msg, []);
  assert.ok(sent[3].content.text.includes('Usage: `.jinimage'));

  await jinaiCommand(mockSock, '12345@s.whatsapp.net', msg, []);
  assert.ok(sent[4].content.text.includes('Usage: `.jinai'));

  await jinapkCommand(mockSock, '12345@s.whatsapp.net', msg, []);
  assert.ok(sent[5].content.text.includes('Usage: `.jinapk'));
});
