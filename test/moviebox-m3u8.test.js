import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadHlsStream, closeM3u8Pool } from '../lib/m3u8.js';
import {
  searchMoviebox,
  getMovieboxMovieDetails,
  getMovieboxSeriesDetails,
  getMovieboxMovieStream,
  getMovieboxEpisodeStream,
  downloadMovieboxStream,
} from '../lib/moviebox.js';
import { getMaxDownloadMB, getMaxDownloadBytes } from '../core/limits.js';

test('limits: getMaxDownloadMB returns valid number', () => {
  const mb = getMaxDownloadMB();
  assert.ok(typeof mb === 'number' && mb > 0);
  assert.equal(getMaxDownloadBytes(), mb * 1024 * 1024);
});

test('moviebox service exports expected functions', () => {
  assert.equal(typeof searchMoviebox, 'function');
  assert.equal(typeof getMovieboxMovieDetails, 'function');
  assert.equal(typeof getMovieboxSeriesDetails, 'function');
  assert.equal(typeof getMovieboxMovieStream, 'function');
  assert.equal(typeof getMovieboxEpisodeStream, 'function');
  assert.equal(typeof downloadMovieboxStream, 'function');
});

test('m3u8 service exports downloadHlsStream and closeM3u8Pool', () => {
  assert.equal(typeof downloadHlsStream, 'function');
  assert.equal(typeof closeM3u8Pool, 'function');
  closeM3u8Pool();
});
