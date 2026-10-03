// ─────────────────────────────────────────────
// Al-Jin · lib/webp-anim.js
// Animated WebP → MP4 / PNG without any extra dependency.
//
// Why this exists: FFmpeg (all 6.x builds, incl. ffmpeg-static) cannot decode
// ANIMATED WebP ("Invalid data found when processing input"). So we read the
// RIFF container ourselves, cut every frame into a standalone still WebP
// (which FFmpeg CAN decode), composite the frames in JS exactly as the WebP
// spec describes (offset / blend / dispose), and stream the result to FFmpeg
// for H.264 encoding. Frames are streamed one by one, so RAM stays small.
// ─────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const MAX_CANVAS = 2048;        // px per side
const MAX_FRAMES = 400;
const MAX_SECONDS = 20;

const u24 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32 = (b, o) => b.readUInt32LE(o);
const tag = (b, o) => b.toString('latin1', o, o + 4);

function put24(b, o, v) { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; }

/** Width/height of a still WebP (VP8X, lossy VP8 or lossless VP8L). */
function stillDimensions(buf) {
  const t = tag(buf, 12);
  if (t === 'VP8X') return { width: u24(buf, 24) + 1, height: u24(buf, 27) + 1 };
  if (t === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (t === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error('unsupported WebP variant');
}

/** Wrap one animation frame's bitstream chunks into a standalone still WebP. */
function standaloneFrame(w, h, data) {
  const first = tag(data, 0);
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0, 'latin1');
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = first === 'ALPH' || first === 'VP8L' ? 0x10 : 0x00; // alpha flag
  put24(vp8x, 12, w - 1);
  put24(vp8x, 15, h - 1);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(4 + vp8x.length + data.length, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, vp8x, data]);
}

/**
 * Parse a WebP buffer.
 * Returns { animated, width, height, frames:[{x,y,w,h,duration,dispose,blend,standalone}] }
 */
export function inspectWebp(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30 || tag(buf, 0) !== 'RIFF' || tag(buf, 8) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const end = Math.min(buf.length, u32(buf, 4) + 8);
  const isAnim = tag(buf, 12) === 'VP8X' && (buf[20] & 0x02) !== 0;

  if (!isAnim) {
    const { width, height } = stillDimensions(buf);
    return {
      animated: false, width, height,
      frames: [{ x: 0, y: 0, w: width, h: height, duration: 0, dispose: 0, blend: 1, standalone: buf }],
    };
  }

  const width = u24(buf, 24) + 1;
  const height = u24(buf, 27) + 1;
  if (width > MAX_CANVAS || height > MAX_CANVAS) throw new Error('animation canvas too large');

  const frames = [];
  let pos = 12;
  while (pos + 8 <= end) {
    const t = tag(buf, pos);
    const size = u32(buf, pos + 4);
    if (t === 'ANMF' && pos + 8 + size <= buf.length && size > 16) {
      const p = pos + 8;
      const w = u24(buf, p + 6) + 1;
      const h = u24(buf, p + 9) + 1;
      const flags = buf[p + 15];
      frames.push({
        x: u24(buf, p) * 2,
        y: u24(buf, p + 3) * 2,
        w, h,
        duration: u24(buf, p + 12),
        dispose: flags & 1,          // 1 = dispose to background
        blend: (flags >> 1) & 1,     // 1 = do NOT alpha-blend
        standalone: standaloneFrame(w, h, buf.subarray(p + 16, p + 8 + size)),
      });
      if (frames.length > MAX_FRAMES) throw new Error('animation has too many frames');
    }
    pos += 8 + size + (size & 1);
  }
  if (!frames.length) throw new Error('animated WebP has no frames');
  return { animated: true, width, height, frames };
}

/** Quick check used by the commands (also true when WhatsApp's flag is missing). */
export function isAnimatedWebp(buf) {
  return Buffer.isBuffer(buf) && buf.length > 21 && tag(buf, 0) === 'RIFF' && tag(buf, 8) === 'WEBP'
    && tag(buf, 12) === 'VP8X' && (buf[20] & 0x02) !== 0;
}

// Decode a run of same-sized still frames in ONE ffmpeg call, streaming RGBA frames out.
async function* decodeRun(ffmpeg, run, timeoutMs) {
  const frameSize = run[0].w * run[0].h * 4;
  const child = spawn(ffmpeg, [
    '-v', 'error', '-f', 'webp_pipe', '-i', 'pipe:0',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (d) => { if (stderr.length < 2000) stderr += d.toString(); });
  child.stdin.on('error', () => {});
  const closed = new Promise((resolve) => child.on('close', resolve));
  const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
  child.stdin.end(Buffer.concat(run.map((f) => f.standalone)));

  let pending = [];
  let pendingLen = 0;
  let produced = 0;
  try {
    for await (const chunk of child.stdout) {
      pending.push(chunk);
      pendingLen += chunk.length;
      while (pendingLen >= frameSize) {
        const all = pending.length === 1 ? pending[0] : Buffer.concat(pending);
        yield all.subarray(0, frameSize);
        produced++;
        const rest = all.subarray(frameSize);
        pending = rest.length ? [rest] : [];
        pendingLen = rest.length;
      }
    }
    const code = await closed;
    if (produced !== run.length) {
      const why = stderr.trim().split('\n').pop() || `exit ${code}`;
      throw new Error(`WebP frame decode failed: ${why}`);
    }
  } finally {
    clearTimeout(timer);
    try { child.kill('SIGKILL'); } catch {}
  }
}

function clearRect(canvas, W, f) {
  for (let row = 0; row < f.h; row++) {
    const o = ((f.y + row) * W + f.x) * 4;
    canvas.fill(0, o, o + f.w * 4);
  }
}

function blit(canvas, W, H, px, f) {
  const cw = Math.min(f.w, W - f.x);
  const ch = Math.min(f.h, H - f.y);
  for (let row = 0; row < ch; row++) {
    let s = row * f.w * 4;
    let d = ((f.y + row) * W + f.x) * 4;
    for (let col = 0; col < cw; col++, s += 4, d += 4) {
      const sa = px[s + 3];
      if (sa === 255 || f.blend === 1) {
        canvas[d] = px[s]; canvas[d + 1] = px[s + 1]; canvas[d + 2] = px[s + 2]; canvas[d + 3] = sa;
      } else if (sa !== 0) {
        const da = canvas[d + 3];
        if (da === 0) {
          canvas[d] = px[s]; canvas[d + 1] = px[s + 1]; canvas[d + 2] = px[s + 2]; canvas[d + 3] = sa;
        } else {
          const dw = (da * (255 - sa)) / 255;
          const oa = sa + dw;
          canvas[d]     = (px[s]     * sa + canvas[d]     * dw) / oa;
          canvas[d + 1] = (px[s + 1] * sa + canvas[d + 1] * dw) / oa;
          canvas[d + 2] = (px[s + 2] * sa + canvas[d + 2] * dw) / oa;
          canvas[d + 3] = oa;
        }
      }
    }
  }
}

/**
 * Async generator of fully composited RGBA canvases.
 * NOTE: the yielded Buffer is reused between iterations — consume it before pulling the next one.
 */
export async function* compositeFrames(info, ffmpeg, { timeoutMs = 90000 } = {}) {
  const { width: W, height: H, frames } = info;
  const canvas = Buffer.alloc(W * H * 4);
  let prev = null;
  let i = 0;
  while (i < frames.length) {
    let j = i + 1;
    while (j < frames.length && frames[j].w === frames[i].w && frames[j].h === frames[i].h) j++;
    const run = frames.slice(i, j);
    let k = 0;
    for await (const px of decodeRun(ffmpeg, run, timeoutMs)) {
      const f = run[k++];
      if (prev && prev.dispose === 1) clearRect(canvas, W, prev);
      blit(canvas, W, H, px, f);
      yield { rgba: canvas, durationMs: f.duration, index: i + k - 1 };
      prev = f;
    }
    i = j;
  }
}

// ── ffmpeg helpers ────────────────────────────────────────────────────────
function startEncoder(ffmpeg, args) {
  const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let stdinError = null;
  child.stderr.on('data', (d) => { if (stderr.length < 2000) stderr += d.toString(); });
  child.stdin.on('error', (e) => { stdinError = e; });
  const closed = new Promise((resolve) => child.on('close', resolve));
  child.on('error', (e) => { stdinError = e; });
  return {
    async write(buf) {
      if (stdinError) throw new Error(`encoder stopped: ${stderr.trim().split('\n').pop() || stdinError.message}`);
      if (!child.stdin.write(buf)) await once(child.stdin, 'drain');
    },
    async finish() {
      child.stdin.end();
      const code = await closed;
      if (code !== 0) throw new Error(`encoder failed (${code}): ${stderr.trim().split('\n').pop() || ''}`);
    },
    abort() { try { child.kill('SIGKILL'); } catch {} },
  };
}

function flattenInto(rgba, rgb, bg) {
  for (let s = 0, d = 0; s < rgba.length; s += 4, d += 3) {
    const a = rgba[s + 3];
    if (a === 255) { rgb[d] = rgba[s]; rgb[d + 1] = rgba[s + 1]; rgb[d + 2] = rgba[s + 2]; }
    else if (a === 0) { rgb[d] = bg; rgb[d + 1] = bg; rgb[d + 2] = bg; }
    else {
      const ia = 255 - a;
      rgb[d]     = (rgba[s]     * a + bg * ia + 127) / 255;
      rgb[d + 1] = (rgba[s + 1] * a + bg * ia + 127) / 255;
      rgb[d + 2] = (rgba[s + 2] * a + bg * ia + 127) / 255;
    }
  }
}

function pickFps(frames) {
  const counts = new Map();
  for (const f of frames) if (f.duration > 0) counts.set(f.duration, (counts.get(f.duration) || 0) + 1);
  let base = 100;
  let best = 0;
  for (const [d, c] of counts) if (c > best) { best = c; base = d; }
  return Math.min(30, Math.max(5, Math.round(1000 / base)));
}

/**
 * Convert a (still or animated) WebP buffer into an H.264 MP4 file.
 * Transparent areas are flattened onto `background` ('white' | 'black').
 * Stills become a short looped clip (stillSeconds).
 */
export async function webpToMp4(buf, outPath, ffmpeg, { background = 'white', stillSeconds = 3 } = {}) {
  const info = inspectWebp(buf);
  const { width: W, height: H } = info;
  const bg = background === 'black' ? 0 : 255;
  const fps = info.animated ? pickFps(info.frames) : 10;
  const frameMs = 1000 / fps;
  const maxOut = fps * MAX_SECONDS;

  const enc = startEncoder(ffmpeg, [
    '-y', '-v', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(fps), '-i', 'pipe:0',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
    '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', outPath,
  ]);

  const rgb = Buffer.alloc(W * H * 3);
  let written = 0;
  try {
    for await (const frame of compositeFrames(info, ffmpeg)) {
      flattenInto(frame.rgba, rgb, bg);
      const ms = info.animated ? (frame.durationMs || 1000 / fps) : stillSeconds * 1000;
      const copies = Math.max(1, Math.round(ms / frameMs));
      for (let c = 0; c < copies && written < maxOut; c++, written++) await enc.write(rgb);
      if (written >= maxOut) break;
    }
    if (!written) throw new Error('no frames decoded');
    await enc.finish();
  } catch (e) {
    enc.abort();
    throw e;
  }
  return { frames: written, fps, animated: info.animated };
}

/**
 * First frame of a (still or animated) WebP as a JPEG file.
 * Transparent areas are flattened onto `background` ('white' | 'black').
 */
export async function webpToJpg(buf, outPath, ffmpeg, { background = 'white' } = {}) {
  const info = inspectWebp(buf);
  const { width: W, height: H } = info;
  const bg = background === 'black' ? 0 : 255;
  const enc = startEncoder(ffmpeg, [
    '-y', '-v', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-frames:v', '1', '-q:v', '2', outPath,
  ]);
  const rgb = Buffer.alloc(W * H * 3);
  try {
    for await (const frame of compositeFrames(info, ffmpeg)) {
      flattenInto(frame.rgba, rgb, bg);
      await enc.write(rgb);
      break;
    }
    await enc.finish();
  } catch (e) {
    enc.abort();
    throw e;
  }
  return { animated: info.animated };
}
