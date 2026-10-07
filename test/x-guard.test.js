// ─────────────────────────────────────────────
// Al-Jin · test/x-guard.test.js
// Offline tests: lib/guard-core.js, lib/audio-effects.js, modules/x-guard.js (mock socket)
// Run:  node --test test/x-guard.test.js
// ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.WRAITH_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'aljin-guard-'));

const core = await import('../lib/guard-core.js');
const { EFFECTS, EFFECT_NAMES } = await import('../lib/audio-effects.js');
const { ffmpegPath } = await import('../lib/ffmpeg-resolver.js');
const guard = await import('../modules/x-guard.js');
const { extraTable, hasExtra } = await import('../modules/x-registry.js');
const { X_DETAILS } = await import('../modules/x-details.js');

// ── guard-core ───────────────────────────────
test('parseDuration / fmtMs', () => {
  assert.equal(core.parseDuration('30s'), 30_000);
  assert.equal(core.parseDuration('2h'), 7_200_000);
  assert.equal(core.parseDuration('1w'), 604_800_000);
  for (const bad of ['', 'abc', '0m', '5', '5x', '99999d', null]) assert.equal(core.parseDuration(bad), null, String(bad));
  assert.equal(core.fmtMs(45_000), '45s');
  assert.equal(core.fmtMs(90_000), '1m 30s');
  assert.equal(core.fmtMs(3_600_000), '1h');
  assert.equal(core.fmtMs(90_000_000), '1d 1h');
});

test('migrateAction: legacy "kick" (strikes) becomes "warn", fresh nodes untouched', () => {
  assert.equal(core.migrateAction({ action: 'kick', limit: 3 }).action, 'warn');
  assert.equal(core.migrateAction({ action: 'kick', v2: true }).action, 'kick');
  assert.equal(core.migrateAction({ action: 'delete' }).action, 'delete');
  assert.equal(core.migrateAction({ action: 'bogus' }).action, 'delete');
});

test('addStrike counts up, resets at the limit', () => {
  const n = { limit: 3 };
  assert.deepEqual(core.addStrike(n, 'u'), { left: 2, limit: 3, reached: false });
  assert.deepEqual(core.addStrike(n, 'u'), { left: 1, limit: 3, reached: false });
  assert.equal(core.addStrike(n, 'u').reached, true);
  assert.equal(n.strikes.u, 0);
  assert.equal(core.addStrike(n, 'other').left, 2);
});

test('actionSub validates action, duration and limit', () => {
  const n = {};
  assert.match(core.actionSub('action', ['action', 'nope'], n, '.x').err, /Usage/);
  assert.ok(core.actionSub('action', ['action', 'warn'], n, '.x').ok);
  assert.equal(n.action, 'warn');
  assert.ok(core.actionSub('action', ['action', 'tkick', '30m'], n, '.x').ok);
  assert.equal(n.tkickMs, 30 * 60_000);
  assert.ok(core.actionSub('action', ['action', 'tkick', '1s'], n, '.x').ok);
  assert.equal(n.tkickMs, core.TKICK_MIN);                       // clamped
  assert.match(core.actionSub('action', ['action', 'tkick', 'soon'], n, '.x').err, /Duration/);
  assert.equal(core.actionSub('limit', ['limit', '5'], n, '.x').ok.includes('5'), true);
  assert.match(core.actionSub('limit', ['limit', '99'], n, '.x').err, /Usage/);
  assert.equal(core.actionSub('other', [], n, '.x'), null);
});

test('matchMute: any number form matches, expiry flagged', () => {
  const mutes = { 111: { ids: ['111', '999'], until: 0 }, 222: { ids: ['222'], until: 1000 } };
  assert.equal(core.matchMute(mutes, ['999'], 5000).key, '111');
  assert.equal(core.matchMute(mutes, ['999'], 5000).expired, false);
  assert.equal(core.matchMute(mutes, ['222'], 5000).expired, true);
  assert.equal(core.matchMute(mutes, ['333'], 5000), null);
  assert.equal(core.matchMute(undefined, ['1']), null);
});

test('isForwarded', () => {
  assert.equal(core.isForwarded({ isForwarded: true }), true);
  assert.equal(core.isForwarded({ forwardingScore: 3 }), true);
  assert.equal(core.isForwarded({ forwardingScore: 0 }), false);
  assert.equal(core.isForwarded(null), false);
});

// ── audio effects: every chain must be accepted by ffmpeg ──
const hasFfmpeg = (() => { try { execFileSync(ffmpegPath, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
for (const name of EFFECT_NAMES) {
  test(`effect "${name}" runs in ffmpeg`, { skip: !hasFfmpeg && 'ffmpeg not available' }, () => {
    const out = path.join(os.tmpdir(), `aljin_fx_${name}_${process.pid}.mp3`);
    try {
      execFileSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-af', EFFECTS[name].af, '-c:a', 'libmp3lame', out], { stdio: 'pipe' });
      assert.ok(fs.statSync(out).size > 500);
    } catch (e) {
      if (/No such filter/.test(String(e.stderr))) return; // minimal ffmpeg build; handler reports it at runtime
      throw e;
    } finally { try { fs.unlinkSync(out); } catch {} }
  });
}

test('registry + details cover the new verbs', () => {
  const want = ['muteuser', 'unmuteuser', 'mutelist', 'mutesticker', 'unmutesticker', 'antiforward', 'dnd', 'fx', ...EFFECT_NAMES];
  for (const v of want) { assert.ok(hasExtra(v), `registry: ${v}`); assert.ok(X_DETAILS[v], `details: ${v}`); }
  assert.ok(extraTable().find((r) => r.verb === 'muteuser').perm === 'admin');
});

// ── guardMessage / enforce with a mock socket ──
const CHAT = '120363000000000000@g.us';
const BOT = '1111@s.whatsapp.net';
const ADMIN = '2222@s.whatsapp.net';
const USER = '3333@s.whatsapp.net';

function mockSock(botIsAdmin = true) {
  const calls = [];
  return {
    calls,
    user: { id: '1111:7@s.whatsapp.net' },
    groupMetadata: async () => ({ participants: [
      { id: BOT, admin: botIsAdmin ? 'admin' : null }, { id: ADMIN, admin: 'admin' }, { id: USER, admin: null },
    ] }),
    sendMessage: async (jid, content, opts) => { calls.push({ jid, content, opts }); return {}; },
    groupParticipantsUpdate: async (jid, list, action) => { calls.push({ jid, list, action }); return [{ status: '200' }]; },
  };
}
const mk = (from, message, id = 'M' + Math.random().toString(36).slice(2), chat = CHAT) => ({ key: { remoteJid: chat, participant: from, id, fromMe: false }, message });
const cfgStore = async () => (await import('../lib/x.js')).store('group', {});
const wasDeleted = (sock, msg) => sock.calls.some((c) => c.content?.delete?.id === msg.key.id);

test('guard: muted user is deleted, admin is not, expiry clears the mute', async () => {
  const s = await cfgStore();
  s.data[CHAT] = { mutes: { 3333: { ids: ['3333'], until: 0 } } };
  const sock = mockSock();

  const m1 = mk(USER, { conversation: 'hello' });
  assert.equal(await guard.guardMessage(sock, CHAT, m1, 'hello'), true);
  assert.ok(wasDeleted(sock, m1));

  s.data[CHAT].mutes = { 2222: { ids: ['2222'], until: 0 } };
  const m2 = mk(ADMIN, { conversation: 'hi' });
  assert.equal(await guard.guardMessage(sock, CHAT, m2, 'hi'), false);

  s.data[CHAT].mutes = { 3333: { ids: ['3333'], until: Date.now() - 1000 } };
  const m3 = mk(USER, { conversation: 'back' });
  assert.equal(await guard.guardMessage(sock, CHAT, m3, 'back'), false);
  assert.equal(Object.keys(s.data[CHAT].mutes).length, 0);
});

test('guard: banned sticker (by hash) is deleted, other stickers pass', async () => {
  const s = await cfgStore();
  const bad = Buffer.from('bad-sticker-hash');
  s.data[CHAT] = { mutedStickers: [bad.toString('base64')] };
  const sock = mockSock();
  const m1 = mk(USER, { stickerMessage: { fileSha256: bad } });
  assert.equal(await guard.guardMessage(sock, CHAT, m1, ''), true);
  assert.ok(wasDeleted(sock, m1));
  const m2 = mk(USER, { stickerMessage: { fileSha256: Buffer.from('fine') } });
  assert.equal(await guard.guardMessage(sock, CHAT, m2, ''), false);
});

test('guard: antiforward "warn" gives strikes then removes', async () => {
  const s = await cfgStore();
  s.data[CHAT] = { antiforward: { on: true, action: 'warn', limit: 2, v2: true } };
  const sock = mockSock();
  const fwd = () => mk(USER, { extendedTextMessage: { text: 'fw', contextInfo: { isForwarded: true, forwardingScore: 2 } } });

  const a = fwd();
  assert.equal(await guard.guardMessage(sock, CHAT, a, 'fw'), true);
  assert.ok(wasDeleted(sock, a));
  assert.ok(sock.calls.some((c) => /1 strike/.test(c.content?.text || '')));
  assert.ok(!sock.calls.some((c) => c.action === 'remove'));

  await guard.guardMessage(sock, CHAT, fwd(), 'fw');
  assert.ok(sock.calls.some((c) => c.action === 'remove' && c.list[0] === USER));

  const normal = mk(USER, { conversation: 'plain' });
  assert.equal(await guard.guardMessage(sock, CHAT, normal, 'plain'), false);
});

test('guard: tkick removes and schedules a return; no admin rights → no removal', async () => {
  const s = await cfgStore();
  s.data[CHAT] = { antiforward: { on: true, action: 'tkick', tkickMs: 120_000, v2: true } };
  const sock = mockSock();
  const m = mk(USER, { extendedTextMessage: { text: 'x', contextInfo: { isForwarded: true } } });
  await guard.guardMessage(sock, CHAT, m, 'x');
  assert.ok(sock.calls.some((c) => c.action === 'remove'));
  const pending = (await import('../lib/x.js')).store('guard', { tkicks: [] }).data.tkicks;
  const rec = pending.find((t) => t.chat === CHAT);
  assert.ok(rec && rec.until > Date.now() + 100_000 && rec.jid === USER);

  // separate chat id: groupMeta() caches per chat for 20 s
  const CHAT2 = '120363999999999999@g.us';
  s.data[CHAT2] = { antiforward: { on: true, action: 'kick', v2: true } };
  const weak = mockSock(false);
  await guard.guardMessage(weak, CHAT2, mk(USER, { extendedTextMessage: { text: 'x', contextInfo: { isForwarded: true } } }, undefined, CHAT2), 'x');
  assert.ok(!weak.calls.some((c) => c.action === 'remove'));
  assert.ok(weak.calls.some((c) => /admin rights/.test(c.content?.text || '')));
});

test('guard: dnd deletes bot tags from members but not from admins', async () => {
  const s = await cfgStore();
  s.data[CHAT] = { dnd: { on: true, msg: 'busy!' } };
  const sock = mockSock();
  const tagMsg = (from) => mk(from, { extendedTextMessage: { text: '@bot hi', contextInfo: { mentionedJid: [BOT] } } });
  const m1 = tagMsg(USER);
  assert.equal(await guard.guardMessage(sock, CHAT, m1, '@bot hi'), true);
  assert.ok(wasDeleted(sock, m1));
  assert.ok(sock.calls.some((c) => /busy!/.test(c.content?.text || '')));
  assert.equal(await guard.guardMessage(sock, CHAT, tagMsg(ADMIN), '@bot hi'), false);
});
