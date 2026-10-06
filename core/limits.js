// ─────────────────────────────────────────────
//  Al-Jin · core/limits.js
//  One place for download-size rules, adjustable live with  .dlcap
//
//  Order of precedence:  .dlcap setting  >  WRAITH_MAX_DOWNLOAD_MB  >  500 MB
//  Hard ceiling 2000 MB — WhatsApp itself refuses files above ~2 GB.
// ─────────────────────────────────────────────
import { getSetting, setSetting } from './settings.js';

export const DEFAULT_MAX_MB = 500;
export const HARD_MAX_MB = 2000;
export const DEFAULT_VIDEO_AS_DOC_MB = 64;
export const DEFAULT_VIDEO_HEIGHT = 480;
const MIN_MB = 5;

const clampMB = (n) => Math.min(HARD_MAX_MB, Math.max(MIN_MB, Math.round(n)));
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function getMaxDownloadMB() {
  const fromSetting = num(getSetting('maxDownloadMB'));
  if (fromSetting) return clampMB(fromSetting);
  const fromEnv = num(process.env.WRAITH_MAX_DOWNLOAD_MB);
  if (fromEnv) return clampMB(fromEnv);
  return DEFAULT_MAX_MB;
}

export const getMaxDownloadBytes = () => getMaxDownloadMB() * 1024 * 1024;

export function setMaxDownloadMB(mb) {
  if (mb === null || mb === undefined) { setSetting('maxDownloadMB', 0); return getMaxDownloadMB(); }
  setSetting('maxDownloadMB', clampMB(mb));
  return getMaxDownloadMB();
}

/** Files above this size go out as a document (WhatsApp plays/streams large videos unreliably). */
export function getDocThresholdBytes() {
  const mb = num(getSetting('videoAsDocMB')) || num(process.env.WRAITH_VIDEO_AS_DOC_MB) || DEFAULT_VIDEO_AS_DOC_MB;
  return mb * 1024 * 1024;
}

/** Highest video height yt-dlp may pick (144–2160). */
export function getVideoHeight() {
  const h = num(getSetting('videoHeight')) || num(process.env.WRAITH_VIDEO_HEIGHT);
  return h >= 144 && h <= 2160 ? Math.round(h) : DEFAULT_VIDEO_HEIGHT;
}
export function setVideoHeight(h) {
  setSetting('videoHeight', h ? Math.min(2160, Math.max(144, Math.round(h))) : 0);
  return getVideoHeight();
}

/** yt-dlp format string for a given height (H.264 + AAC first so no re-encode is needed). */
export function videoFormat(h = getVideoHeight()) {
  return `bv*[vcodec^=avc1][height<=${h}]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a][height<=${h}]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
}

/** Big files need time: never less than 2 min, ~4 s per MB of cap, at most 1 h. */
export function getDownloadTimeoutMs() {
  return Math.min(60 * 60 * 1000, Math.max(120_000, getMaxDownloadMB() * 4000));
}

/** yt-dlp stops BEFORE downloading when it knows the file is over the cap. */
export const ytdlpSizeArgs = () => ['--max-filesize', `${getMaxDownloadMB()}M`];

export const fmtMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

/** Human text for  .dlcap 500 / 1gb / 1.5 gb  → MB (or null if unparseable). */
export function parseSizeToMB(text) {
  const m = String(text || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mb|m|gb|g)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /^g/.test(m[2] || '') ? n * 1024 : n;
}

/** Alias used by the generic .dl pipeline. */
export const videoHeightForDl = () => getVideoHeight();
