// ─────────────────────────────────────────────
// Al-Jin · test/subtitle.test.js
// .subtitle — cue building, SRT/ASS output, SRT parsing and the STT fallback chain
// (providers are mocked through fetch; no network or API key needed).
// ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// keys are read once, so set them before the modules load
process.env.GROQ_API_KEY = 'test-groq';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.DEEPGRAM_API_KEY = 'test-deepgram';

const { buildCues, cuesToSrt, cuesToAss, formatTimestamp, assTime, resolveStyle, resolveFont, FONTS, STYLES } = await import('../lib/subtitle-render.js');
const { parseSrt, transcribe, configuredProviders } = await import('../lib/stt.js');

const tmpAudio = path.join(os.tmpdir(), `aljin_test_${Date.now()}.mp3`);
fs.writeFileSync(tmpAudio, Buffer.alloc(2048, 1));
test.after(() => { try { fs.unlinkSync(tmpAudio); } catch {} });

test('formatTimestamp never prints ,1000 and pads correctly', () => {
  assert.equal(formatTimestamp(1.9996), '00:00:02,000');
  assert.equal(formatTimestamp(3661.5), '01:01:01,500');
  assert.equal(formatTimestamp(-4), '00:00:00,000');
  assert.equal(assTime(61.234), '0:01:01.23');
});

test('buildCues splits long text, keeps order and removes overlaps', () => {
  const cues = buildCues([
    { start: 4, end: 6, text: 'second' },
    { start: 0, end: 4, text: 'This is a very long sentence that must be broken into several shorter readable subtitle cues for the screen.' },
  ], { maxChars: 40, duration: 6 });
  assert.ok(cues.length >= 3);
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].text.length <= 40, `cue ${i} too long`);
    assert.ok(cues[i].end > cues[i].start);
    if (i) assert.ok(cues[i].start >= cues[i - 1].end - 1e-6, 'cues overlap');
  }
  assert.equal(cues.at(-1).text, 'second');
});

test('buildCues drops empty text and cues after the video end', () => {
  const cues = buildCues([{ start: 0, end: 1, text: '   ' }, { start: 10, end: 12, text: 'late' }, { start: 1, end: 2, text: 'ok' }], { duration: 5 });
  assert.deepEqual(cues.map((c) => c.text), ['ok']);
});

test('cuesToSrt output round-trips through parseSrt', () => {
  const cues = [{ start: 0.5, end: 2.25, text: 'Hello' }, { start: 3, end: 4.5, text: 'World' }];
  const back = parseSrt(cuesToSrt(cues));
  assert.equal(back.length, 2);
  assert.equal(back[0].text, 'Hello');
  assert.ok(Math.abs(back[1].start - 3) < 0.001 && Math.abs(back[1].end - 4.5) < 0.001);
});

test('parseSrt tolerates markdown fences and dot milliseconds', () => {
  const segs = parseSrt('```srt\n1\n00:00:01.5 --> 00:00:03.000\nHi there\n\n2\n00:00:03,000 --> 00:00:04,000\nBye\n```');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].start, 1.5);
});

test('cuesToAss scales font to the video size and escapes override braces', () => {
  const land = cuesToAss([{ start: 0, end: 1, text: 'a {b} c' }], { width: 1280, height: 720, style: 'youtube' });
  const port = cuesToAss([{ start: 0, end: 1, text: 'x' }], { width: 720, height: 1280, style: 'boldpop' });
  assert.match(land, /PlayResX: 1280/);
  assert.match(land, /PlayResY: 720/);
  assert.ok(!/\{b\}/.test(land));
  const size = (doc) => Number(doc.match(/Style: Default,[^,]*,(\d+),/)[1]);
  assert.ok(size(land) > 30 && size(land) < 60);
  assert.ok(size(port) > 30 && size(port) < 70);
});

test('resolveStyle understands aliases', () => {
  assert.equal(resolveStyle('NF'), 'netflix');
  assert.equal(resolveStyle('bold'), 'boldpop');
  assert.equal(resolveStyle('nope'), null);
});

test('every font slot points at a bundled file and F-codes resolve', () => {
  for (const [k, f] of Object.entries(FONTS)) {
    assert.ok(fs.existsSync(new URL(`../fonts/${f.file}`, import.meta.url)), `${k} missing ${f.file}`);
  }
  assert.equal(resolveFont('f2'), 'F2');
  assert.equal(resolveFont('F99'), null);
  assert.equal(resolveFont('netflix'), null);
});

test('every style, font, position and size produces a valid ASS style line', () => {
  for (const style of Object.keys(STYLES)) {
    const doc = cuesToAss([{ start: 0, end: 1, text: 'x' }], { width: 640, height: 360, style, font: FONTS.F2.family, position: 'top', sizeMul: 1.25 });
    assert.match(doc, /Style: Default,Poppins,\d+,&H/);
    assert.match(doc, /,8,\d+,\d+,\d+,1\n/);   // alignment 8 = top
  }
});

test('burn timeout stays an integer for fractional durations', () => {
  const ms = Math.round(Math.min(25 * 60_000, Math.max(180_000, 51.484818 * 6000)));
  assert.ok(Number.isInteger(ms));
});

// ── STT fallback chain ───────────────────────────────────────────────
function mockFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const r = await handler(String(url), init);
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status || 200 });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('all three providers are configured from keys', () => {
  assert.deepEqual(configuredProviders().map((p) => p.name).slice(0, 3), ['Groq', 'Gemini', 'Deepgram']);
});

test('transcribe uses Groq first and normalises segments', async () => {
  const m = mockFetch((url) => url.includes('groq.com')
    ? { body: { segments: [{ start: 0, end: 2, text: ' Hello ' }] } }
    : { status: 500, body: {} });
  try {
    const r = await transcribe(tmpAudio);
    assert.equal(r.provider, 'Groq');
    assert.deepEqual(r.segments, [{ start: 0, end: 2, text: 'Hello' }]);
    assert.equal(m.calls.length, 1);
  } finally { m.restore(); }
});

test('transcribe falls back to Gemini when Groq answers 401', async () => {
  const m = mockFetch((url) => {
    if (url.includes('groq.com')) return { status: 401, body: { error: { message: 'bad key' } } };
    if (url.includes('generativelanguage')) {
      return { body: { candidates: [{ content: { parts: [{ text: '1\n00:00:00,000 --> 00:00:02,000\nFrom Gemini\n' }] } }] } };
    }
    return { status: 500, body: {} };
  });
  try {
    const r = await transcribe(tmpAudio);
    assert.equal(r.provider, 'Gemini');
    assert.equal(r.segments[0].text, 'From Gemini');
  } finally { m.restore(); }
});

test('transcribe falls through to Deepgram and reports all failures when everything is down', async () => {
  let m = mockFetch((url) => {
    if (url.includes('deepgram.com')) return { body: { results: { utterances: [{ start: 0, end: 1.5, transcript: 'From Deepgram' }] } } };
    return { status: 403, body: { error: { message: 'denied' } } };
  });
  try {
    const r = await transcribe(tmpAudio);
    assert.equal(r.provider, 'Deepgram');
  } finally { m.restore(); }

  m = mockFetch(() => ({ status: 403, body: { error: { message: 'denied' } } }));
  try {
    await assert.rejects(() => transcribe(tmpAudio), /All speech-to-text providers failed.*Groq.*Gemini.*Deepgram/s);
  } finally { m.restore(); }
});
