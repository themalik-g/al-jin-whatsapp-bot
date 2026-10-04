import test from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS, getCommandCategoryEmoji, reactMsg, editStatus } from '../lib/reaction-helper.js';

test('reaction-helper: emoji categories', () => {
  assert.equal(getCommandCategoryEmoji('play'), EMOJIS.PLAY);
  assert.equal(getCommandCategoryEmoji('mp3'), EMOJIS.PLAY);
  assert.equal(getCommandCategoryEmoji('image'), EMOJIS.PHOTO);
  assert.equal(getCommandCategoryEmoji('movie'), EMOJIS.MOVIE);
  assert.equal(getCommandCategoryEmoji('video'), EMOJIS.MOVIE);
  assert.equal(getCommandCategoryEmoji('ytv'), EMOJIS.MOVIE);
  assert.equal(getCommandCategoryEmoji('search'), EMOJIS.SEARCH);
  assert.equal(getCommandCategoryEmoji('wiki'), EMOJIS.SEARCH);
  assert.equal(getCommandCategoryEmoji('url'), EMOJIS.UPLOAD);
  assert.equal(getCommandCategoryEmoji('dl'), EMOJIS.DOWNLOAD);
  assert.equal(getCommandCategoryEmoji('ytdl'), EMOJIS.DOWNLOAD);
  assert.equal(getCommandCategoryEmoji('unknown_cmd'), EMOJIS.WAITING);
});

test('reaction-helper: reactMsg and editStatus mock execution', async () => {
  const sent = [];
  const mockSock = {
    sendMessage: async (chat, content) => {
      sent.push({ chat, content });
      return { key: { id: 'status_id' } };
    }
  };

  const key = { id: 'msg_id', remoteJid: 'chat@s.whatsapp.net' };
  await reactMsg(mockSock, 'chat@s.whatsapp.net', key, EMOJIS.INITIAL);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    chat: 'chat@s.whatsapp.net',
    content: { react: { text: EMOJIS.INITIAL, key } }
  });

  await editStatus(mockSock, 'chat@s.whatsapp.net', { key: { id: 'status_id' } }, 'Downloading 50% done...');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], {
    chat: 'chat@s.whatsapp.net',
    content: { text: 'Downloading 50% done...', edit: { id: 'status_id' } }
  });
});
