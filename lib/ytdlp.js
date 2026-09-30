// ─────────────────────────────────────────────
// WRAITH · lib/ytdlp.js
// ytdlp-nodejs utility wrapper using ffmpeg-static
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { YtDlp } from 'ytdlp-nodejs';
import { ffmpegPath, ffmpegDir } from './ffmpeg-resolver.js';
import { getCookiesFilePath } from '../modules/ytcookies.js';

const DATA_ROOT = process.env.WRAITH_DATA_DIR || process.cwd();
const TMP_DIR = path.resolve(DATA_ROOT, 'data', 'tmp', 'wraith-ytdlp');
fs.mkdirSync(TMP_DIR, { recursive: true });

// Ensure process temporary environment points to project data storage
if (!process.env.TMPDIR || process.env.TMPDIR.startsWith('/tmp')) {
  process.env.TMPDIR = TMP_DIR;
  process.env.TEMP = TMP_DIR;
  process.env.TMP = TMP_DIR;
}

export const ytdlp = new YtDlp({
  ffmpegPath: ffmpegDir || ffmpegPath,
});

export function getTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// YouTube now needs a JS runtime (deno/node) to solve its signature challenge.
// Node is already running this bot, so tell yt-dlp to use it, and let it fetch
// the challenge-solver script (EJS) from GitHub.
const MODERN_ARGS = ['--js-runtimes', 'node', '--remote-components', 'ejs:github'];

export function configureDownload(dl, outputDir = getTmpDir(), { modern = true } = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  if (dl?.extraArgs) {
    dl.extraArgs.paths = { temp: outputDir, home: outputDir };
  }
  if (typeof dl?.addArgs === 'function') {
    const args = ['--no-cache-dir', '--no-playlist', '--concurrent-fragments', '2'];
    if (modern) args.push(...MODERN_ARGS);
    const cookiesFile = getCookiesFilePath();
    if (cookiesFile) {
      args.push('--cookies', cookiesFile);
    }
    dl.addArgs(...args);
  }
  return dl;
}

export function cleanFile(filePath) {
  try {
    if (!filePath) return;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const partPath = `${filePath}.part`;
    if (fs.existsSync(partPath)) {
      fs.unlinkSync(partPath);
    }
    const ytdlPath = `${filePath}.ytdl`;
    if (fs.existsSync(ytdlPath)) {
      fs.unlinkSync(ytdlPath);
    }
    const tempMp4Path = `${filePath}.temp.mp4`;
    if (fs.existsSync(tempMp4Path)) {
      fs.unlinkSync(tempMp4Path);
    }
  } catch {}
}

export function cleanPrefix(prefix, dir = getTmpDir()) {
  try {
    if (!prefix || !fs.existsSync(dir)) return;
    const doClean = () => {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(prefix) || f.includes(prefix)) {
          const fullPath = path.join(dir, f);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(fullPath);
            }
          } catch {}
        }
      }
    };
    doClean();
    // Secondary delayed cleanup pass in case of brief file handle locks
    setTimeout(() => {
      try { doClean(); } catch {}
    }, 1000);
  } catch {}
}

export function cleanOldTmpFiles(maxAgeMs = 3 * 60 * 1000) {
  try {
    if (!fs.existsSync(TMP_DIR)) return;
    const now = Date.now();
    for (const f of fs.readdirSync(TMP_DIR)) {
      const fullPath = path.join(TMP_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      } catch {}
    }
  } catch {}
}

// Find the finished file when the library doesn't report a usable path.
export function pickFile(res, dir, prefix) {
  const reported = res?.filePaths?.[0] || res?.filePath || null;
  if (reported && fs.existsSync(reported)) return reported;
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.includes(prefix) && !/\.(part|ytdl|temp\.mp4|json|jpg|webp)$/i.test(f))
      .map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] || null;
  } catch { return null; }
}

/**
 * Run one yt-dlp download. `build(dl)` adds the format/output options and
 * returns the builder. If the installed yt-dlp is too old to know the new
 * JS-runtime flags, it retries once without them.
 */
export async function runYtdlp(target, outputDir, prefix, build) {
  let lastErr;
  for (const modern of [true, false]) {
    try {
      const dl = ytdlp.download(target);
      configureDownload(dl, outputDir, { modern });
      const res = await build(dl).run();
      const file = pickFile(res, outputDir, prefix);
      if (file) return file;
      lastErr = new Error('yt-dlp finished but no file was created');
      break;
    } catch (e) {
      lastErr = e;
      console.error(`[ytdlp] ${target} (modern=${modern}) failed:`, e?.message || e);
      if (!/no such option|unrecognized arguments|unknown option/i.test(String(e?.message || e))) break;
    }
  }
  throw lastErr;
}
