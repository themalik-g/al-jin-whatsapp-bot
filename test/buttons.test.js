import assert from 'assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate from the real project data/ folder so a saved reply-mode setting
// (or WRAITH_REPLY_MODE) can never change the result of this test.
process.env.WRAITH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aljin-btn-'));
delete process.env.WRAITH_REPLY_MODE;

const {
  createQuickReply,
  createCtaUrl,
  createCtaCopy,
  createCtaCall,
  createSingleSelect,
  createLocationRequest,
  extractInteractiveResponse,
  sendInteractive,
} = await import('../lib/buttons.js');
const { setReplyMode, getReplyMode } = await import('../core/settings.js');

console.log('--- Testing lib/buttons.js ---');

// 1. Test button creation helpers
const qr = createQuickReply('Test Button', '.ping');
assert.strictEqual(qr.name, 'quick_reply');
assert.deepStrictEqual(JSON.parse(qr.buttonParamsJson), { display_text: 'Test Button', id: '.ping' });

const urlBtn = createCtaUrl('Visit Site', 'https://example.com');
assert.strictEqual(urlBtn.name, 'cta_url');
assert.deepStrictEqual(JSON.parse(urlBtn.buttonParamsJson), { display_text: 'Visit Site', url: 'https://example.com', merchant_url: 'https://example.com' });

const locBtn = createLocationRequest('Share Location');
assert.strictEqual(locBtn.name, 'send_location');
assert.deepStrictEqual(JSON.parse(locBtn.buttonParamsJson), { display_text: 'Share Location' });

// 2. Test response extraction
// Quick Reply
const msg1 = {
  message: {
    buttonsResponseMessage: {
      selectedButtonId: '.ghost on'
    }
  }
};
assert.strictEqual(extractInteractiveResponse(msg1), '.ghost on');

// Modern Interactive Native Flow Response
const msg2 = {
  message: {
    interactiveResponseMessage: {
      nativeFlowResponseMessage: {
        name: 'quick_reply',
        paramsJson: JSON.stringify({ id: '.lurk on' })
      }
    }
  }
};
assert.strictEqual(extractInteractiveResponse(msg2), '.lurk on');

// Single Select List Response
const msg3 = {
  message: {
    listResponseMessage: {
      singleSelectReply: {
        selectedRowId: 'menu_ghost'
      }
    }
  }
};
assert.strictEqual(extractInteractiveResponse(msg3), 'menu_ghost');

// 3. Test sendInteractive with a mock socket
function makeSock() {
  const sock = { relayCalls: [], sendCalls: [] };
  sock.relayMessage = async (jid, msg, options) => { sock.relayCalls.push({ jid, msg, options }); };
  sock.sendMessage = async (jid, content, options) => { sock.sendCalls.push({ jid, content, options }); };
  return sock;
}
const JID = '1234567890@s.whatsapp.net';
const payload = {
  body: 'Hello world',
  buttons: [createQuickReply('Ping', '.ping'), createLocationRequest('Share Location')],
};

// 3a. Default reply mode is plain text (buttons are opt-in): one text message, no relay.
assert.strictEqual(getReplyMode(), 'text');
const textSock = makeSock();
await sendInteractive(textSock, JID, payload);
assert.strictEqual(textSock.relayCalls.length, 0);
assert.strictEqual(textSock.sendCalls.length, 1);
assert.strictEqual(textSock.sendCalls[0].jid, JID);
assert.ok(textSock.sendCalls[0].content.text.includes('Hello world'));

// 3b. Buttons mode: the message must actually go out through the socket.
setReplyMode('buttons');
assert.strictEqual(getReplyMode(), 'buttons');
const btnSock = makeSock();
await sendInteractive(btnSock, JID, payload);
assert.ok(btnSock.relayCalls.length + btnSock.sendCalls.length > 0, 'buttons mode sent nothing');
if (btnSock.relayCalls.length) {
  assert.strictEqual(btnSock.relayCalls[0].jid, JID);
  assert.ok(btnSock.relayCalls[0].options?.additionalNodes?.length > 0);
}
setReplyMode('text');

console.log('✅ All lib/buttons.js tests passed successfully!');
