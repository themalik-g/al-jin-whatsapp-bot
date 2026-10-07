// ─────────────────────────────────────────────
//  Al-Jin · lib/sysinfo.js
//  System probes shared by .ping/.cpu/.gpu/.ram/.rom and the menu header.
//  Container-aware (cgroup v1/v2) so numbers match what a panel shows.
//  Every function is crash-safe (never throws).
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── cgroup ──────────────────────────────────
function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } }

function detectCgroupVersion() {
  const cg = readFileSafe('/proc/self/cgroup');
  if (!cg) return 0;
  return /^0::/m.test(cg) ? 2 : 1;
}
function detectCgroupPath() {
  const cg = readFileSafe('/proc/self/cgroup');
  if (!cg) return '';
  const v2 = cg.match(/^0::(.+)$/m);
  if (v2) return v2[1];
  const v1 = cg.match(/^\d+:[^:]*:(.+)$/m);
  return v1 ? v1[1] : '';
}
const CG_VERSION = detectCgroupVersion();
const CG_PATH = detectCgroupPath();

const cgReadV2 = (file) => readFileSafe(`/sys/fs/cgroup${CG_PATH}/${file}`) ?? readFileSafe(`/sys/fs/cgroup/${file}`);
const cgReadV1 = (sub, file) => readFileSafe(`/sys/fs/cgroup/${sub}${CG_PATH}/${file}`) ?? readFileSafe(`/sys/fs/cgroup/${sub}/${file}`);

// ── formatting ──────────────────────────────
export function bar(pct, width = 10) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.max(0, Math.min(width, Math.round((p / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
export function fmtBytes(b) {
  b = Number(b) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i >= 3 ? 2 : i === 0 ? 0 : 1)} ${u[i]}`;
}
export function fmtDuration(totalSec) {
  const s = Math.floor(totalSec);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}
export const uptimeText = () => fmtDuration(process.uptime());

export function qualityPct(pct) {
  if (pct < 60) return '🟢';
  if (pct < 80) return '🟡';
  if (pct < 92) return '🟠';
  return '🔴';
}

// ── RAM ─────────────────────────────────────
export function containerMemory() {
  try {
    if (CG_VERSION === 2) {
      const current = parseInt(cgReadV2('memory.current') || '0', 10);
      const maxRaw = cgReadV2('memory.max');
      const limit = (!maxRaw || maxRaw === 'max') ? 0 : parseInt(maxRaw, 10);
      if (current > 0 && limit > 0) return { used: current, limit, source: 'container (cgroup v2)' };
    }
    if (CG_VERSION === 1) {
      const current = parseInt(cgReadV1('memory', 'memory.usage_in_bytes') || '0', 10);
      let limit = parseInt(cgReadV1('memory', 'memory.limit_in_bytes') || '0', 10);
      if (limit > 1e15) limit = 0;
      if (current > 0 && limit > 0) return { used: current, limit, source: 'container (cgroup v1)' };
    }
  } catch { /* fall through to host */ }
  const total = os.totalmem();
  return { used: total - os.freemem(), limit: total, source: 'host' };
}

/** One-line RAM for the menu, e.g. "212.4 MB / 1.00 GB". */
export function ramSummary() {
  const m = containerMemory();
  return `${fmtBytes(m.used)} / ${fmtBytes(m.limit)}`;
}

// ── CPU ─────────────────────────────────────
function cgCpuUsageUsec() {
  if (CG_VERSION === 2) {
    const m = (cgReadV2('cpu.stat') || '').match(/^usage_usec\s+(\d+)/m);
    if (m) return parseInt(m[1], 10);
  }
  if (CG_VERSION === 1) {
    const raw = cgReadV1('cpuacct', 'cpuacct.usage');
    if (raw) return Math.floor(parseInt(raw, 10) / 1000);
  }
  return null;
}
export function cgCpuCores() {
  if (CG_VERSION === 2) {
    const raw = cgReadV2('cpu.max');
    if (raw) {
      const [q, p] = raw.split(/\s+/);
      if (q !== 'max' && parseInt(q, 10) > 0 && parseInt(p, 10) > 0) return parseInt(q, 10) / parseInt(p, 10);
    }
  }
  if (CG_VERSION === 1) {
    const q = parseInt(cgReadV1('cpu', 'cpu.cfs_quota_us') || '0', 10);
    const p = parseInt(cgReadV1('cpu', 'cpu.cfs_period_us') || '0', 10);
    if (q > 0 && p > 0) return q / p;
  }
  return null;
}

/** Sample CPU load over gapMs. Container-aware, falls back to host load. */
export async function sampleCpu(gapMs = 400) {
  try {
    const before = cgCpuUsageUsec();
    if (before !== null) {
      const t0 = process.hrtime.bigint();
      await new Promise((r) => setTimeout(r, gapMs));
      const t1 = process.hrtime.bigint();
      const after = cgCpuUsageUsec();
      if (after !== null) {
        const wall = Number(t1 - t0) / 1000;
        const quota = cgCpuCores();
        const frac = wall > 0 ? (after - before) / wall : 0;
        const denom = quota && quota > 0 ? quota : (os.cpus()?.length || 1);
        return { pct: Math.max(0, Math.min(100, (frac / denom) * 100)), cores: quota || os.cpus()?.length || 1, source: 'container' };
      }
    }
  } catch { /* host fallback below */ }

  // host-wide sample from os.cpus()
  const snap = () => os.cpus().reduce((a, c) => {
    const t = Object.values(c.times).reduce((x, y) => x + y, 0);
    return { idle: a.idle + c.times.idle, total: a.total + t };
  }, { idle: 0, total: 0 });
  const a = snap();
  await new Promise((r) => setTimeout(r, gapMs));
  const b = snap();
  const dt = b.total - a.total;
  const pct = dt > 0 ? (1 - (b.idle - a.idle) / dt) * 100 : 0;
  return { pct: Math.max(0, Math.min(100, pct)), cores: os.cpus()?.length || 1, source: 'host' };
}

export function cpuModel() {
  try {
    const c = os.cpus();
    return { model: (c?.[0]?.model || 'Unknown CPU').replace(/\s+/g, ' ').trim(), threads: c?.length || 1, speed: c?.[0]?.speed || 0 };
  } catch { return { model: 'Unknown CPU', threads: 1, speed: 0 }; }
}

// ── GPU ─────────────────────────────────────
function run(cmd, args, timeout = 2500) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 1024 * 256 }, (err, stdout) => resolve(err ? null : String(stdout || '').trim()));
    } catch { resolve(null); }
  });
}

/** Returns an array of { name, extra } — empty when no GPU is visible. */
export async function gpuList() {
  const out = [];
  const nv = await run('nvidia-smi', ['--query-gpu=name,memory.total,memory.used,utilization.gpu', '--format=csv,noheader,nounits']);
  if (nv) {
    for (const line of nv.split('\n')) {
      const [name, total, used, util] = line.split(',').map((x) => x.trim());
      if (name) out.push({ name, extra: `VRAM ${used || '?'} / ${total || '?'} MiB · load ${util || '?'}%` });
    }
  }
  if (!out.length) {
    const lspci = await run('lspci', []);
    if (lspci) {
      for (const line of lspci.split('\n')) {
        if (/VGA compatible controller|3D controller|Display controller/i.test(line)) {
          out.push({ name: line.replace(/^.*?controller:\s*/i, '').trim(), extra: '' });
        }
      }
    }
  }
  if (!out.length) {
    try {
      const dir = '/sys/class/drm';
      for (const d of fs.readdirSync(dir)) {
        if (!/^card\d+$/.test(d)) continue;
        const vendor = readFileSafe(`${dir}/${d}/device/vendor`);
        const device = readFileSafe(`${dir}/${d}/device/device`);
        if (vendor) out.push({ name: `PCI ${vendor}:${device || '????'}`, extra: '' });
      }
    } catch { /* no drm */ }
  }
  return out;
}

// ── ROM / disk ──────────────────────────────
function statDisk(p) {
  try {
    const s = fs.statfsSync(p);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, free, used: total - free };
  } catch { return null; }
}

function dirSize(dir, depth = 0) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < 6 && e.name !== 'node_modules' && e.name !== '.git') total += dirSize(p, depth + 1); }
      else { try { total += fs.statSync(p).size; } catch { /* skip */ } }
    }
  } catch { /* skip */ }
  return total;
}

export function romInfo() {
  const disk = statDisk(ROOT) || statDisk('/') || null;
  let project = 0;
  try { project = dirSize(ROOT); } catch { /* ignore */ }
  return { disk, project, root: ROOT };
}

// ── platform / version ──────────────────────
function osName() {
  try {
    if (process.platform === 'linux') {
      const rel = readFileSafe('/etc/os-release');
      const m = rel && rel.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      return m ? `Linux ${m[1]}` : 'Linux generic';
    }
    if (process.platform === 'darwin') return 'macOS';
    if (process.platform === 'win32') return 'Windows';
    return process.platform;
  } catch { return 'Unknown OS'; }
}

/** Platform as parts: [hostKind, osName] — the menu prints each part on its own bar line. */
export function platformParts() {
  const e = process.env;
  let kind = 'vps';
  if ((e.PREFIX || '').includes('com.termux') || e.TERMUX_VERSION) kind = 'termux';
  else if (e.DYNO) kind = 'heroku';
  else if (e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID) kind = 'railway';
  else if (e.RENDER || e.RENDER_SERVICE_ID) kind = 'render';
  else if (e.REPL_ID || e.REPLIT_DB_URL) kind = 'replit';
  else if (e.KOYEB_APP_NAME) kind = 'koyeb';
  else if (e.FLY_APP_NAME) kind = 'fly.io';
  else if (e.P_SERVER_UUID || e.PTERODACTYL) kind = 'panel';
  else if (e.CODESPACES) kind = 'codespaces';
  else if (e.GITPOD_WORKSPACE_ID) kind = 'gitpod';
  else if (fs.existsSync('/.dockerenv')) kind = 'docker';
  else if (process.platform === 'win32') kind = 'pc';
  else if (process.platform === 'darwin') kind = 'mac';
  return [kind, osName()].filter(Boolean);
}

/** One-line form (kept for compatibility). */
export function detectPlatform() {
  const [kind, os_] = platformParts();
  return os_ ? `${kind} (${os_})` : kind;
}

let _version = null;
export function botVersion() {
  if (_version) return _version;
  try {
    _version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0';
  } catch { _version = '1.0.0'; }
  return _version;
}
