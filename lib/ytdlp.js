// ─────────────────────────────────────────────
// Al-Jin · lib/ytdlp.js
// ytdlp-nodejs utility wrapper using ffmpeg-static
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { YtDlp } from 'ytdlp-nodejs';
import { ffmpegPath, ffmpegDir } from './ffmpeg-resolver.js';
import { getCookiesFilePath } from '../modules/ytcookies.js';
import { ytdlpSizeArgs } from '../core/limits.js';

const DATA_ROOT = process.env.WRAITH_DATA_DIR || process.cwd();
const TMP_DIR = path.resolve(DATA_ROOT, 'data', 'tmp', 'wraith-ytdlp');
fs.mkdirSync(TMP_DIR, { recursive: true });
const CACHE_DIR = path.resolve(DATA_ROOT, 'data', 'ytdlp-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

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
// Speed knobs (all overridable): parallel fragments for HLS/DASH streams, fewer & shorter retries so a dead
// link fails fast instead of hanging for minutes, and a bigger read buffer for faster plain downloads.
const FRAGMENTS = String(Math.max(1, Math.min(32, Number(process.env.WRAITH_DL_FRAGMENTS) || 12)));
const SPEED_ARGS = ['--concurrent-fragments', FRAGMENTS, '--retries', '3', '--fragment-retries', '5',
  '--extractor-retries', '2', '--socket-timeout', '20', '--buffer-size', '64K'];

const MODERN_ARGS = ['--js-runtimes', process.versions.bun ? 'bun' : 'node', '--remote-components', 'ejs:github'];

export function configureDownload(dl, outputDir = getTmpDir(), { modern = true } = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  if (dl?.extraArgs) {
    dl.extraArgs.paths = { temp: outputDir, home: outputDir };
  }
  if (typeof dl?.addArgs === 'function') {
    // Persistent cache: keeps YouTube player/signature-solver results between runs (big speedup).
    const args = ['--cache-dir', CACHE_DIR, '--no-playlist', ...SPEED_ARGS,
      '--no-mtime', '--no-warnings', '--ffmpeg-location', ffmpegDir,
      ...ytdlpSizeArgs()];   // live download cap (.dlcap) — yt-dlp skips files it knows are too big
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
// Ignores yt-dlp's un-merged fragments (name.f137.mp4 / name.f140.m4a) — picking
// one of those is what produced "audio only + black screen" videos.
export function pickFile(res, dir, prefix) {
  const isFragment = (f) => /\.f[\w-]+\.[a-z0-9]+$/i.test(f);
  const reported = res?.filePaths?.[0] || res?.filePath || null;
  if (reported && fs.existsSync(reported) && !isFragment(reported)) return reported;
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.includes(prefix) && !/\.(part|ytdl|temp\.mp4|json|jpg|webp|png)$/i.test(f))
      .map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).isFile());
    const merged = files.filter((f) => !isFragment(f));
    const pool = merged.length ? merged : files;
    pool.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return pool[0] || null;
  } catch { return null; }
}

/**
 * Run one yt-dlp download. `build(dl)` adds the format/output options and
 * returns the builder. If the installed yt-dlp is too old to know the new
 * JS-runtime flags, it retries once without them.
 */
export async function runYtdlp(target, outputDir, prefix, build, onProgress) {
  let lastErr;
  for (const modern of [true, false]) {
    try {
      const dl = ytdlp.download(target);
      configureDownload(dl, outputDir, { modern });
      const built = build(dl);
      if (typeof onProgress === 'function' && typeof built.on === 'function') {
        built.on('progress', (p) => {
          if (p && typeof p.percent === 'number') {
            try { onProgress(Math.round(p.percent)); } catch {}
          }
        });
      }
      const res = await built.run();
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


// ─────────────────────────────────────────────
//  Available qualities
//  getVideoInfo(target)          → yt-dlp's JSON for a video (null if it can't be read)
//  summarizeVideoFormats(info)   → { title, duration, uploader, url, options:[{ height, size, h264 }] }
//  Only heights that really exist are listed, and (when the size is known) only those that fit the
//  download cap — so every choice offered can actually be downloaded.
// ─────────────────────────────────────────────
function findYtdlpBinary() {
  const isWin = process.platform === 'win32';
  const names = isWin ? ['yt-dlp.exe'] : ['yt-dlp', 'yt-dlp_linux', 'yt-dlp_macos'];
  const cands = [process.env.YTDLP_PATH, ytdlp?.binaryPath, ytdlp?.binary?.path, ytdlp?.options?.binaryPath].filter((x) => typeof x === 'string' && x);
  const dirs = [];
  try { dirs.push(path.join(path.dirname(createRequire(import.meta.url).resolve('ytdlp-nodejs/package.json')), 'bin')); } catch {}
  dirs.push(path.resolve(process.cwd(), 'node_modules', 'ytdlp-nodejs', 'bin'));
  for (const d of dirs) for (const n of names) cands.push(path.join(d, n));
  for (const c of cands) { try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {} }
  return isWin ? 'yt-dlp.exe' : 'yt-dlp';           // maybe installed system-wide
}

function runJson(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(err || e); }
    });
  });
}

export async function getVideoInfo(target, { timeoutMs = 45_000 } = {}) {
  const bin = findYtdlpBinary();
  for (const modern of [true, false]) {
    try {
      const args = ['-J', '--no-playlist', '--no-warnings', '--cache-dir', CACHE_DIR,
        '--extractor-retries', '2', '--socket-timeout', '20', '--ffmpeg-location', ffmpegDir];
      if (modern) args.push(...MODERN_ARGS);
      const cookiesFile = getCookiesFilePath();
      if (cookiesFile) args.push('--cookies', cookiesFile);
      args.push(target);
      let info = await runJson(bin, args, timeoutMs);
      if (info?.entries?.length) info = info.entries[0];          // "ytsearch1:" returns a one-item playlist
      if (info && Array.isArray(info.formats)) return info;
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/no such option|unrecognized arguments|unknown option/i.test(msg)) {
        console.error(`[ytdlp] info (modern=${modern}) failed:`, msg.slice(0, 200));
        if (modern) continue;
      }
    }
  }
  // last try: the library's own helper (older/newer yt-dlp-nodejs builds)
  try {
    if (typeof ytdlp.getInfoAsync === 'function') {
      const info = await ytdlp.getInfoAsync(target);
      if (info && Array.isArray(info.formats)) return info;
    }
  } catch { /* give up quietly — the caller downloads at the default quality */ }
  return null;
}

const fSize = (f, dur) => Number(f.filesize) || Number(f.filesize_approx) || (f.tbr && dur ? Math.round(Number(f.tbr) * 125 * dur) : 0);
const isH264 = (f) => /^avc1|^h264/i.test(String(f.vcodec || ''));

export function summarizeVideoFormats(info, { maxBytes = Infinity } = {}) {
  if (!info || !Array.isArray(info.formats)) return null;
  const dur = Number(info.duration) || 0;
  const video = info.formats.filter((f) => f && f.vcodec && f.vcodec !== 'none' && Number(f.height) >= 144 && f.protocol !== 'mhtml' && !/storyboard/i.test(String(f.format_note || '')));
  const audio = info.formats.filter((f) => f && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
  const bestAudio = audio.sort((a, b) => (/m4a|mp4/i.test(b.ext || '') - /m4a|mp4/i.test(a.ext || '')) || ((b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)))[0];
  const audioSize = bestAudio ? fSize(bestAudio, dur) : 0;

  const byHeight = new Map();
  for (const f of video) {
    const h = Number(f.height);
    if (!byHeight.has(h)) byHeight.set(h, []);
    byHeight.get(h).push(f);
  }
  const options = [];
  for (const [height, list] of byHeight) {
    // the file we would actually fetch: H.264 first (plays everywhere), then the biggest bitrate
    list.sort((a, b) => (isH264(b) - isH264(a)) || ((b.tbr || 0) - (a.tbr || 0)));
    const pick = list[0];
    const muxed = pick.acodec && pick.acodec !== 'none';
    const v = fSize(pick, dur);
    const size = v ? v + (muxed ? 0 : audioSize) : 0;
    if (size && size > maxBytes) continue;                       // would be refused by the size cap anyway
    options.push({ height, size, h264: list.some(isH264), fps: Number(pick.fps) || 0 });
  }
  options.sort((a, b) => b.height - a.height);
  return {
    title: String(info.title || '').trim(),
    duration: dur,
    uploader: String(info.uploader || info.channel || '').trim(),
    url: String(info.webpage_url || info.original_url || '').trim(),
    options,
  };
}

/**
 * Audio qualities a video really has (one entry per distinct bitrate tier, best first, max 3).
 * Fewer than 2 tiers → nothing to choose. Sizes over the cap are left out.
 * Returns { title, duration, uploader, url, options:[{ abr, size, label }] }.
 */
export function summarizeAudioFormats(info, { maxBytes = Infinity } = {}) {
  if (!info || !Array.isArray(info.formats)) return null;
  const dur = Number(info.duration) || 0;
  const audio = info.formats
    .filter((f) => f && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none') && (Number(f.abr) || Number(f.tbr)))
    .sort((a, b) => (Number(b.abr) || Number(b.tbr)) - (Number(a.abr) || Number(a.tbr)));
  const tiers = [];
  for (const f of audio) {
    const abr = Math.round(Number(f.abr) || Number(f.tbr));
    const near = tiers.find((t) => Math.abs(t.abr - abr) <= Math.max(8, t.abr * 0.12));
    const m4a = /m4a|mp4/i.test(f.ext || '');
    if (near) {                                           // same tier: keep the m4a (plays natively in WhatsApp)
      if (!near.m4a && m4a) { near.m4a = true; near.abr = abr; near.size = fSize(f, dur); }
      continue;
    }
    tiers.push({ abr, m4a, size: fSize(f, dur) });
  }
  let usable = tiers.filter((t) => !(t.size && t.size > maxBytes));
  if (usable.length > 3) usable = [usable[0], usable[Math.floor(usable.length / 2)], usable[usable.length - 1]];
  const names = usable.length === 2 ? ['High', 'Low'] : ['High', 'Medium', 'Low'];
  return {
    title: String(info.title || '').trim(),
    duration: dur,
    uploader: String(info.uploader || info.channel || '').trim(),
    url: String(info.webpage_url || info.original_url || '').trim(),
    options: usable.map((t, i) => ({ abr: t.abr, size: t.size, label: names[i] || 'Audio' })),
  };
}
