import assert from 'node:assert';
import { episodeNo, qualityBucket, groupEpisodes, autoPick, qualityOptions, videoFiles, parseFilesXml, cleanQuery } from '../lib/ia-movies.js';

assert.strictEqual(episodeNo('Show S01E11 480p'), 11);
assert.strictEqual(episodeNo('show_ep_07'), 7);
assert.strictEqual(episodeNo('Show - 12 - Title_512kb'), 12);
assert.strictEqual(episodeNo('1080p movie 2019'), 0);
assert.strictEqual(qualityBucket({ height: '1080' }), 1080);
assert.strictEqual(qualityBucket({ height: '576' }), 480);
assert.strictEqual(qualityBucket({ name: 'a_720p.mp4' }), 720);
assert.strictEqual(qualityBucket({ name: 'a.mp4', format: '512Kb MPEG4' }), 360);
assert.strictEqual(qualityBucket({ name: 'a.mp4', format: 'MPEG4' }), 0);
assert.strictEqual(cleanQuery('  Bat"man: 1989!! '), 'Bat man 1989');

const MB = 1024 * 1024;
const raw = [
  { name: 'S01E01.mp4', size: String(300 * MB), height: '720', format: 'h.264' },
  { name: 'S01E01_512kb.mp4', size: String(90 * MB), format: '512Kb MPEG4' },
  { name: 'S01E02.mp4', size: String(700 * MB), height: '1080' },
  { name: 'S01E02_512kb.mp4', size: String(95 * MB), format: '512Kb MPEG4' },
  { name: 'S01E03.mkv', size: String(100 * MB) },
  { name: 'trailer.mp4', size: String(50 * MB) },
  { name: 'thumb.jpg', size: '1000' },
];
const vids = videoFiles(raw);
assert.strictEqual(vids.length, 4);                    // mp4 only, trailer skipped
const eps = groupEpisodes(vids);
assert.deepStrictEqual([...eps.keys()], [1, 2]);
assert.strictEqual(qualityOptions(eps.get(1)).length, 2);
const best = autoPick(eps.get(2), { maxBytes: 500 * MB, maxHeight: 720 });
assert.strictEqual(best.bucket, 360);                  // 1080p exceeds both caps → falls back to 360
assert.strictEqual(autoPick(eps.get(1), { maxBytes: 500 * MB, maxHeight: 720 }).bucket, 720);
assert.strictEqual(autoPick(eps.get(2), { maxBytes: 10 * MB, maxHeight: 720 }), null);

const seq = groupEpisodes(videoFiles([{ name: 'alpha.mp4', size: String(50 * MB) }, { name: 'beta.mp4', size: String(50 * MB) }]));
assert.deepStrictEqual([...seq.keys()], [1, 2]);          // unnumbered files get sequential numbers

const xml = '<files><file name="A &amp; B.mp4" source="original"><format>MPEG4</format><size>123</size><height>480</height></file></files>';
assert.deepStrictEqual(parseFilesXml(xml)[0], { name: 'A & B.mp4', format: 'MPEG4', size: '123', height: '480' });
console.log('movies.test.js: all passed');
