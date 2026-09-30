import test from 'node:test';
import assert from 'assert';
import { ocrCommand } from '../modules/tools.js';
import { createCtaCopy } from '../lib/buttons.js';

test('OCR command - non-image reply check', async () => {
  let sentMessage = null;
  const mockSock = {
    sendMessage: async (chat, content, options) => {
      sentMessage = { chat, content, options };
      return { key: { id: 'msg_id_1' } };
    }
  };

  const mockMsg = {
    key: { remoteJid: '123456789@s.whatsapp.net', id: 'msg_1' },
    message: {
      conversation: 'Hello'
    }
  };

  await ocrCommand(mockSock, '123456789@s.whatsapp.net', mockMsg, []);
  assert.ok(sentMessage);
  assert.ok(sentMessage.content.text.includes('Please reply to an image'));
});

test('CTA Copy button creation for OCR', () => {
  const btn = createCtaCopy('📋 Copy Text', 'Extracted OCR text sample');
  assert.strictEqual(btn.name, 'cta_copy');
  const params = JSON.parse(btn.buttonParamsJson);
  assert.strictEqual(params.display_text, '📋 Copy Text');
  assert.strictEqual(params.copy_code, 'Extracted OCR text sample');
});
