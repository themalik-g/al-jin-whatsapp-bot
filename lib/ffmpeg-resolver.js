// ─────────────────────────────────────────────
// WRAITH · lib/ffmpeg-resolver.js
// Resolves system ffmpeg/ffprobe with fallback to static packages
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

function works(bin) {
  try {
    const r = spawnSync(bin, ['-version'], { timeout: 4000 });
    return r.status === 0;
  } catch { return false; }
}

// Turn a bare command name ("ffmpeg") into an absolute path so it can be
// symlinked into data/bin and handed to yt-dlp via --ffmpeg-location.
function whichAbs(name) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(cmd, [name], { timeout: 3000, encoding: 'utf8' });
    if (r.status === 0) {
      const first = String(r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return fs.realpathSync(first);
    }
  } catch {}
  return null;
}

function resolveBin(name, staticPath) {
  const sys = whichAbs(name);
  if (sys && works(sys)) return sys;
  if (staticPath && fs.existsSync(staticPath) && works(staticPath)) return staticPath;
  console.error(`[ffmpeg-resolver] ${name} NOT FOUND. Install it (apt install ffmpeg) or run: npm rebuild ${name}-static`);
  return staticPath || name;
}

function resolveFfmpeg() { return resolveBin('ffmpeg', ffmpegStatic); }
function resolveFfprobe() { return resolveBin('ffprobe', ffprobeStatic?.path || ffprobeStatic); }

export const ffmpegPath = resolveFfmpeg();
export const ffprobePath = resolveFfprobe();

function prepareFfmpegDir() {
  const DATA_ROOT = process.env.WRAITH_DATA_DIR || process.cwd();
  const binDir = path.resolve(DATA_ROOT, 'data', 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const ffmpegBin = path.join(binDir, 'ffmpeg');
  const ffprobeBin = path.join(binDir, 'ffprobe');

  const setupBinary = (targetPath, destPath) => {
    if (!targetPath || !path.isAbsolute(targetPath)) return;
    try { fs.rmSync(destPath, { force: true }); } catch {}
    try {
      fs.symlinkSync(targetPath, destPath);
    } catch {
      try { fs.copyFileSync(targetPath, destPath); fs.chmodSync(destPath, 0o755); } catch {}
    }
  };

  setupBinary(ffmpegPath, ffmpegBin);
  setupBinary(ffprobePath, ffprobeBin);

  // Prepend binDir to PATH environment variable if not already present
  if (process.env.PATH) {
    if (!process.env.PATH.includes(binDir)) {
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
    }
  } else {
    process.env.PATH = binDir;
  }

  return binDir;
}

export const ffmpegDir = prepareFfmpegDir();
