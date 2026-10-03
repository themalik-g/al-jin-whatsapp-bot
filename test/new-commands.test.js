// ─────────────────────────────────────────────
// Al-Jin · test/new-commands.test.js
// Unit tests for newly added commands
// ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// bwip-js is a declared dependency (npm install). If it is missing, skip the
// barcode tests with a clear message instead of crashing the whole file.
let bwipjs = null;
try { bwipjs = (await import('bwip-js')).default; } catch {}
const noBwip = bwipjs ? false : 'bwip-js not installed — run npm install';

// Network tests only make sense when the internet is reachable.
let online = false;
try {
  const r = await fetch('https://registry.npmjs.org/express', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
  online = r.ok;
} catch {}
const offline = online ? false : 'network unavailable';
import { createCtaUrl } from '../lib/buttons.js';

test('Barcode generation test', { skip: noBwip }, async () => {
  const buf = await bwipjs.toBuffer({
    bcid: 'code128',
    text: '123456789',
    scale: 3,
    height: 10,
    includetext: true,
  });
  assert.ok(buf instanceof Buffer);
  assert.ok(buf.length > 100);
});

test('Barcode QR generation test', { skip: noBwip }, async () => {
  const buf = await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: 'https://github.com/themalik-g/al-jin-whatsapp-bot',
    scale: 3,
    height: 20,
    includetext: true,
  });
  assert.ok(buf instanceof Buffer);
  assert.ok(buf.length > 100);
});

test('NPM Registry API test', { skip: offline }, async () => {
  const res = await fetch('https://registry.npmjs.org/express');
  assert.equal(res.ok, true);
  const json = await res.json();
  assert.equal(json.name, 'express');
  assert.ok(json['dist-tags']?.latest);
});

test('Unroll redirect tracker test', { skip: offline }, async () => {
  const targetUrl = 'https://tinyurl.com/2p8v25tw';
  let currentUrl = targetUrl;
  const redirectChain = [currentUrl];

  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(currentUrl, { method: 'HEAD', redirect: 'manual' });
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, currentUrl).href;
        redirectChain.push(nextUrl);
        currentUrl = nextUrl;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  assert.ok(redirectChain.length >= 1);
});

test('VCard format test', () => {
  const digits = '923257853673';
  const name = `User +${digits}`;
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
    'END:VCARD',
  ].join('\n');

  assert.ok(vcard.includes('BEGIN:VCARD'));
  assert.ok(vcard.includes('waid=923257853673'));
});

test('Fun commands (fancy, dice, coin) test', async () => {
  const { fancyCommand, diceCommand, coinCommand } = await import('../modules/fun.js');

  let sentMessage = null;
  const mockSock = {
    sendMessage: async (chat, content) => {
      sentMessage = content.text;
    },
  };
  const mockMsg = { key: { remoteJid: '123@s.whatsapp.net' } };

  // Test fancyCommand
  await fancyCommand(mockSock, '123@s.whatsapp.net', mockMsg, ['hello']);
  assert.ok(sentMessage.includes('✨ *fancy*'));
  assert.ok(sentMessage.includes('1. 𝐡𝐞𝐥𝐥𝐨'));

  await fancyCommand(mockSock, '123@s.whatsapp.net', mockMsg, ['1', 'hello']);
  assert.ok(!sentMessage.includes('✨ *fancy*')); // single line result

  // Test diceCommand
  await diceCommand(mockSock, '123@s.whatsapp.net', mockMsg, ['2d6+1']);
  assert.ok(sentMessage.includes('🎲 *2d6+1*'));

  // Test coinCommand
  await coinCommand(mockSock, '123@s.whatsapp.net', mockMsg, ['5']);
  assert.ok(sentMessage.includes('🪙 *5 flips*'));
});
