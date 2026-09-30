// ─────────────────────────────────────────────
// WRAITH · lib/ffmpeg-resolver.js
// Resolves system ffmpeg/ffprobe with fallback to static packages
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

function resolveFfmpeg() {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { timeout: 2000 });
    if (res.status === 0) {
      return 'ffmpeg';
    }
  } catch {}
  return ffmpegStatic;
}

function resolveFfprobe() {
  try {
    const res = spawnSync('ffprobe', ['-version'], { timeout: 2000 });
    if (res.status === 0) {
      return 'ffprobe';
    }
  } catch {}
  return ffprobeStatic?.path || ffprobeStatic;
}

export const ffmpegPath = resolveFfmpeg();
export const ffprobePath = resolveFfprobe();

function prepareFfmpegDir() {
  const DATA_ROOT = process.env.WRAITH_DATA_DIR || process.cwd();
  const binDir = path.resolve(DATA_ROOT, 'data', 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const ffmpegBin = path.join(binDir, 'ffmpeg');
  const ffprobeBin = path.join(binDir, 'ffprobe');

  const setupBinary = (targetPath, destPath, name) => {
    if (!targetPath) return;

    // Check if destPath already exists (file or symlink)
    let exists = false;
    try {
      fs.lstatSync(destPath);
      exists = true;
    } catch {}

    if (exists) {
      // If it's a symlink or file, check if it points to targetPath or works
      try {
        if (fs.existsSync(destPath)) {
          return;
        }
        // If it's a broken/dangling symlink, remove it first
        fs.unlinkSync(destPath);
      } catch {
        try { fs.rmSync(destPath, { force: true }); } catch {}
      }
    }

    if (targetPath !== name) {
      try {
        try {
          fs.symlinkSync(targetPath, destPath);
        } catch {
          fs.copyFileSync(targetPath, destPath);
        }
      } catch {}
    }
  };

  setupBinary(ffmpegPath, ffmpegBin, 'ffmpeg');
  setupBinary(ffprobePath, ffprobeBin, 'ffprobe');

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
