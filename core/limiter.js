// ─────────────────────────────────────────────
//  Al-Jin · core/limiter.js
//  CPU + RAM governor behind  .cpulimit  and  .ramlimit
//
//  CPU  — a "CPU-seconds bucket" is refilled at <limit> cores per second.
//         Everything the bot burns (its own process + every child process it
//         started: ffmpeg, yt-dlp, …) is deducted from it.
//           • bucket < 0  → child processes are paused (SIGSTOP) and new
//                           commands wait at gate() until the debt is repaid.
//           • bucket ≥ 0  → children are resumed (SIGCONT).
//         Result: jobs run in short slices and simply take longer, but the
//         average stays at the limit and the spikes are flattened.
//         (cpulimit-style duty cycling; no root, no extra packages.)
//
//  RAM  — watches the bot + its children against a ceiling.
//           ≥ 75 %  trim caches + run GC
//           ≥ 90 %  new commands wait until memory drops
//           ≥ 100 % kill the biggest runaway child; optional auto-restart
//
//  Linux gets the full feature set (child accounting via /proc).
//  Elsewhere the bot's own CPU is gated and children only get a lower priority.
//  Every function is crash-safe. Zero timers run while both limits are off.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import v8 from 'node:v8';
import vm from 'node:vm';
import util from 'node:util';
import cp from 'node:child_process';
import nodeModule from 'node:module';
import { getSetting, setSetting } from './settings.js';
import { cgCpuCores } from '../lib/sysinfo.js';

const HAS_PROC = process.platform === 'linux' && fs.existsSync('/proc/self/stat');
const PAGE = 4096;
let CLK_TCK = 100;
try {
  const t = parseInt(String(cp.execFileSync('getconf', ['CLK_TCK'], { timeout: 1500 })).trim(), 10);
  if (t > 0) CLK_TCK = t;
} catch { /* keep 100 */ }

const envNum = (...keys) => {
  for (const k of keys) if (process.env[k] !== undefined && process.env[k] !== '') return process.env[k];
  return undefined;
};

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
export const MIN_CPU_CORES = 0.05;
const BURST_S = 0.25;        // how much "saved up" CPU may be spent as a burst
const DEBT_S = 1.0;          // deepest debt we allow (seconds of budget)
const GATE_MAX_MS = 15_000;  // a command never waits longer than this at the gate
const GATE_SATURATED_MS = 2_000;

const cpu = {
  limit: 0,                  // cores, 0 = off
  auto: false,               // follow the container quota
  bucket: 0,
  paused: false,
  ewma: 0,                   // recent usage, cores
  lastHr: 0n,
  lastSelf: 0,
  timer: null,
  saturatedTicks: 0,
  stats: { pauses: 0, gated: 0, gatedMs: 0, pausedMs: 0, since: Date.now() },
};

const ram = {
  limitBytes: 0,
  restart: false,
  state: 'ok',               // ok | soft | high | over
  used: 0,
  selfRss: 0,
  childRss: 0,
  timer: null,
  lastGc: 0,
  overSince: 0,
  stats: { gc: 0, trims: 0, killed: 0, since: Date.now() },
};

const children = new Map();   // pid → { pid, label, lastTicks, born }
const stopped = new Set();    // pids we have SIGSTOPped
let lastScan = 0;
const pressureHandlers = new Set();

export function onMemoryPressure(fn) {
  if (typeof fn === 'function') pressureHandlers.add(fn);
  return () => pressureHandlers.delete(fn);
}

// ─────────────────────────────────────────────
//  /proc helpers (Linux)
// ─────────────────────────────────────────────
function readStat(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = raw.lastIndexOf(')');
    if (close < 0) return null;
    const f = raw.slice(close + 2).split(' ');
    return {
      ppid: parseInt(f[1], 10),
      ticks: (parseInt(f[11], 10) || 0) + (parseInt(f[12], 10) || 0),   // utime + stime
      rss: (parseInt(f[21], 10) || 0) * PAGE,
      state: f[0],
    };
  } catch { return null; }
}

/** Every live descendant of this process (children, grandchildren, …). */
function scanDescendants() {
  const byParent = new Map();
  let names;
  try { names = fs.readdirSync('/proc'); } catch { return []; }
  for (const n of names) {
    if (n.charCodeAt(0) < 48 || n.charCodeAt(0) > 57) continue;
    const pid = parseInt(n, 10);
    if (!pid || pid === process.pid) continue;
    const st = readStat(pid);
    if (!st) continue;
    let arr = byParent.get(st.ppid);
    if (!arr) byParent.set(st.ppid, (arr = []));
    arr.push(pid);
  }
  const out = [];
  const queue = [process.pid];
  while (queue.length) {
    const p = queue.pop();
    for (const c of byParent.get(p) || []) { out.push(c); queue.push(c); }
  }
  return out;
}

function refreshChildren(force = false) {
  if (!HAS_PROC) return;
  const now = Date.now();
  if (!force && now - lastScan < 400) return;
  lastScan = now;
  const live = new Set(scanDescendants());
  for (const pid of live) {
    if (!children.has(pid)) {
      const st = readStat(pid);
      children.set(pid, { pid, label: 'child', lastTicks: st ? st.ticks : 0, born: now });
    }
  }
  for (const pid of [...children.keys()]) {
    if (!live.has(pid) && !isAlive(pid)) { children.delete(pid); stopped.delete(pid); }
  }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// ─────────────────────────────────────────────
//  Child-process registration (patches child_process once)
// ─────────────────────────────────────────────
function track(child, label) {
  if (!child || !child.pid) return child;
  try {
    children.set(child.pid, { pid: child.pid, label, lastTicks: 0, born: Date.now() });
    if (cpu.limit > 0) { try { os.setPriority(child.pid, 10); } catch { /* not allowed here */ } }
    const drop = () => { children.delete(child.pid); stopped.delete(child.pid); };
    child.once('exit', drop);
    child.once('error', drop);
    if (cpu.limit > 0) kick();
  } catch { /* never break the caller */ }
  return child;
}

function patchChildProcess() {
  if (cp.__aljinLimiter) return;
  try {
    for (const fn of ['spawn', 'exec', 'execFile']) {
      const orig = cp[fn];
      if (typeof orig !== 'function') continue;
      const wrapped = function (...args) { return track(orig.apply(this, args), fn); };
      if (fn !== 'spawn') {
        // keep util.promisify(exec/execFile) → { stdout, stderr }
        wrapped[util.promisify.custom] = (...args) => {
          let child;
          const p = new Promise((resolve, reject) => {
            child = wrapped(...args, (err, stdout, stderr) => {
              if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); }
              else resolve({ stdout, stderr });
            });
          });
          p.child = child;
          return p;
        };
      }
      Object.defineProperty(wrapped, 'name', { value: fn });
      cp[fn] = wrapped;
    }
    Object.defineProperty(cp, '__aljinLimiter', { value: true });
    nodeModule.syncBuiltinESMExports();   // ESM `import { spawn } from 'node:child_process'` sees the wrappers
  } catch (e) {
    try { console.error('[limiter] could not patch child_process:', e.message); } catch {}
  }
}
patchChildProcess();

// ─────────────────────────────────────────────
//  Pause / resume children
// ─────────────────────────────────────────────
function signalAll(sig) {
  for (const pid of children.keys()) {
    try {
      process.kill(pid, sig);
      if (sig === 'SIGSTOP') stopped.add(pid); else stopped.delete(pid);
    } catch { children.delete(pid); stopped.delete(pid); }
  }
}

export function releaseAll() {
  for (const pid of [...stopped]) { try { process.kill(pid, 'SIGCONT'); } catch { /* gone */ } }
  stopped.clear();
}

process.on('exit', () => { try { releaseAll(); } catch {} });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  const h = () => {
    try { releaseAll(); } catch {}
    // we only added a listener — keep the default "terminate" behaviour when nobody else handles it
    if (process.listenerCount(sig) <= 1) { process.removeListener(sig, h); try { process.kill(process.pid, sig); } catch {} }
  };
  try { process.on(sig, h); } catch { /* unsupported signal */ }
}

// ─────────────────────────────────────────────
//  CPU control loop
// ─────────────────────────────────────────────
const selfCpuSec = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; };

function kick() {
  if (cpu.limit <= 0 || cpu.timer) return;
  cpu.lastHr = process.hrtime.bigint();
  cpu.lastSelf = selfCpuSec();
  cpu.timer = setTimeout(cpuTick, 50);
  cpu.timer.unref?.();
}

function cpuTick() {
  cpu.timer = null;
  if (cpu.limit <= 0) return;
  try {
    const nowHr = process.hrtime.bigint();
    const dt = Math.max(0.001, Number(nowHr - cpu.lastHr) / 1e9);
    cpu.lastHr = nowHr;

    // own process
    const self = selfCpuSec();
    let used = Math.max(0, self - cpu.lastSelf);
    cpu.lastSelf = self;

    // children
    if (HAS_PROC && children.size) {
      refreshChildren();
      for (const c of children.values()) {
        const st = readStat(c.pid);
        if (!st) continue;
        if (st.ticks >= c.lastTicks) used += (st.ticks - c.lastTicks) / CLK_TCK;
        c.lastTicks = st.ticks;
      }
    }

    // bucket
    const cap = cpu.limit * BURST_S;
    const floor = -cpu.limit * DEBT_S;
    cpu.bucket = Math.min(cap, Math.max(floor, cpu.bucket + cpu.limit * dt - used));
    cpu.ewma += (used / dt - cpu.ewma) * (1 - Math.exp(-dt / 2));
    cpu.saturatedTicks = cpu.bucket <= floor * 0.98 ? cpu.saturatedTicks + 1 : 0;

    const wasPaused = cpu.paused;
    cpu.paused = cpu.bucket < 0;
    if (cpu.paused) {
      cpu.stats.pausedMs += dt * 1000;
      if (!wasPaused) cpu.stats.pauses++;
      if (children.size) signalAll('SIGSTOP');
    } else if (stopped.size) {
      releaseAll();
    }
  } catch (e) {
    try { console.error('[limiter:cpu]', e.message); } catch {}
  }

  const busy = children.size > 0 || cpu.paused;
  const next = busy ? 30 : (cpu.ewma > cpu.limit * 0.3 ? 100 : 250);
  cpu.timer = setTimeout(cpuTick, next);
  cpu.timer.unref?.();
}

function stopCpuLoop() {
  if (cpu.timer) { clearTimeout(cpu.timer); cpu.timer = null; }
  cpu.paused = false;
  cpu.bucket = 0;
  cpu.ewma = 0;
  releaseAll();
}

// ─────────────────────────────────────────────
//  Gate — new commands wait here while the bot is over budget
// ─────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

export async function gate() {
  const needed = () => (cpu.limit > 0 && cpu.paused) || ram.state === 'high' || ram.state === 'over';
  if (!needed()) return 0;
  const t0 = Date.now();
  while (needed() && Date.now() - t0 < GATE_MAX_MS) {
    // limit below the bot's own idle usage → don't make every command wait the full time
    if (cpu.limit > 0 && cpu.saturatedTicks > 40 && Date.now() - t0 > GATE_SATURATED_MS) break;
    await sleep(40);
  }
  const waited = Date.now() - t0;
  cpu.stats.gated++;
  cpu.stats.gatedMs += waited;
  return waited;
}

// ─────────────────────────────────────────────
//  RAM watchdog
// ─────────────────────────────────────────────
function runGc() {
  try {
    if (typeof globalThis.gc !== 'function') {
      v8.setFlagsFromString('--expose-gc');
      globalThis.gc = vm.runInNewContext('gc');
    }
    globalThis.gc();
    ram.stats.gc++;
  } catch { /* no gc available */ }
}

function measureRam() {
  ram.selfRss = process.memoryUsage().rss;
  let kids = 0;
  if (HAS_PROC && children.size) {
    for (const c of children.values()) { const st = readStat(c.pid); if (st) kids += st.rss; }
  }
  ram.childRss = kids;
  ram.used = ram.selfRss + kids;
  return ram.used;
}

function killBiggestChild() {
  let best = null;
  for (const c of children.values()) {
    const st = readStat(c.pid);
    if (st && (!best || st.rss > best.rss)) best = { pid: c.pid, rss: st.rss };
  }
  if (!best) return false;
  try { process.kill(best.pid, 'SIGKILL'); ram.stats.killed++; console.warn(`[limiter] RAM over limit — killed child ${best.pid} (${Math.round(best.rss / 1048576)} MB)`); return true; }
  catch { return false; }
}

function ramTick() {
  ram.timer = null;
  if (ram.limitBytes <= 0) return;
  try {
    if (HAS_PROC && children.size) refreshChildren();
    const used = measureRam();
    const r = used / ram.limitBytes;
    const prev = ram.state;
    ram.state = r >= 1 ? 'over' : r >= 0.9 ? 'high' : r >= 0.75 ? 'soft' : 'ok';
    if (prev === 'high' || prev === 'over') { if (r >= 0.85 && ram.state === 'soft') ram.state = 'high'; }   // hysteresis

    const now = Date.now();
    if (ram.state !== 'ok' && now - ram.lastGc > 15_000) {
      ram.lastGc = now;
      for (const fn of pressureHandlers) { try { fn(ram.state); ram.stats.trims++; } catch {} }
      runGc();
    }

    if (ram.state === 'over') {
      if (!ram.overSince) ram.overSince = now;
      const killed = killBiggestChild();
      if (!killed && ram.restart && now - ram.overSince >= 20_000) {
        console.warn('[limiter] RAM stayed over the limit for 20 s — restarting to free memory.');
        setTimeout(() => process.exit(0), 300);
      }
    } else {
      ram.overSince = 0;
    }
  } catch (e) {
    try { console.error('[limiter:ram]', e.message); } catch {}
  }
  ram.timer = setTimeout(ramTick, ram.state === 'ok' ? 3000 : 1500);
  ram.timer.unref?.();
}

function applyHeapCap() {
  try {
    if (ram.limitBytes <= 0) return;
    const wantMB = Math.max(64, Math.floor((ram.limitBytes / 1048576) * 0.7));
    const curMB = Math.floor(v8.getHeapStatistics().heap_size_limit / 1048576);
    if (wantMB < curMB) v8.setFlagsFromString(`--max-old-space-size=${wantMB}`);   // best effort
  } catch { /* ignore */ }
}

function stopRamLoop() {
  if (ram.timer) { clearTimeout(ram.timer); ram.timer = null; }
  ram.state = 'ok';
  ram.overSince = 0;
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────
export const hasProc = () => HAS_PROC;
export const containerCores = () => { try { return cgCpuCores(); } catch { return null; } };

/** "0.30", "0.3 cores", "30%", "1.5" → cores (number), 0 = off, null = unparseable. */
export function parseCpuLimit(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (['off', '0', 'none', 'reset', 'disable', 'disabled', 'no'].includes(t)) return 0;
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(%|core|cores|cpu|c)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return n === 0 ? 0 : null;
  return m[2] === '%' ? n / 100 : n;
}

/** "256", "512mb", "1gb", "1.5 g" → MB, 0 = off, null = unparseable. */
export function parseRamLimit(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (['off', '0', 'none', 'reset', 'disable', 'disabled', 'no'].includes(t)) return 0;
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(mb|m|gb|g)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return /^g/.test(m[2] || '') ? n * 1024 : n;
}

export function setCpuLimit(cores, { auto = false } = {}) {
  const c = Number(cores) > 0 ? Math.max(MIN_CPU_CORES, Number(cores)) : 0;
  cpu.limit = c;
  cpu.auto = !!(c && auto);
  setSetting('cpulimit', c ? (cpu.auto ? 'auto' : c) : 0);
  if (c) {
    cpu.bucket = 0;
    for (const pid of children.keys()) { try { os.setPriority(pid, 10); } catch {} }
    kick();
  } else {
    stopCpuLoop();
  }
  return cpu.limit;
}

export function setRamLimitMB(mb, { restart } = {}) {
  const b = Number(mb) > 0 ? Math.max(64, Number(mb)) * 1048576 : 0;
  ram.limitBytes = b;
  if (restart !== undefined) ram.restart = !!restart;
  setSetting('ramlimitMB', b ? Math.round(b / 1048576) : 0);
  setSetting('ramlimitRestart', ram.restart ? 1 : 0);
  if (b) {
    applyHeapCap();
    if (!ram.timer) { ram.timer = setTimeout(ramTick, 500); ram.timer.unref?.(); }
  } else {
    stopRamLoop();
  }
  return ram.limitBytes / 1048576;
}

export function limiterStatus() {
  if (ram.limitBytes > 0 || cpu.limit > 0) measureRam();
  return {
    platformFull: HAS_PROC,
    cpu: {
      enabled: cpu.limit > 0,
      limit: cpu.limit,
      auto: cpu.auto,
      usage: cpu.ewma,
      paused: cpu.paused,
      bucket: cpu.bucket,
      children: children.size,
      stoppedNow: stopped.size,
      pauses: cpu.stats.pauses,
      gated: cpu.stats.gated,
      gatedMs: Math.round(cpu.stats.gatedMs),
      pausedMs: Math.round(cpu.stats.pausedMs),
      saturated: cpu.saturatedTicks > 40,
      quota: containerCores(),
      hostCores: os.cpus()?.length || 1,
    },
    ram: {
      enabled: ram.limitBytes > 0,
      limitMB: Math.round(ram.limitBytes / 1048576),
      restart: ram.restart,
      state: ram.state,
      used: ram.used,
      selfRss: ram.selfRss,
      childRss: ram.childRss,
      gc: ram.stats.gc,
      trims: ram.stats.trims,
      killed: ram.stats.killed,
    },
  };
}

// ─────────────────────────────────────────────
//  Boot: saved setting  >  env  >  off
// ─────────────────────────────────────────────
(function boot() {
  try {
    let saved = getSetting('cpulimit');
    if (saved === undefined || saved === null || saved === 0 || saved === '0') {
      const e = envNum('AL_JIN_CPU_LIMIT', 'WRAITH_CPU_LIMIT');
      if (e !== undefined) saved = e;
    }
    if (saved === 'auto') {
      const q = containerCores();
      if (q) { cpu.limit = Math.max(MIN_CPU_CORES, q * 0.9); cpu.auto = true; }
    } else {
      const parsed = parseCpuLimit(saved);
      if (parsed) cpu.limit = Math.max(MIN_CPU_CORES, parsed);
    }
    if (cpu.limit > 0) kick();

    let mb = Number(getSetting('ramlimitMB')) || 0;
    if (!mb) { const e = parseRamLimit(envNum('AL_JIN_RAM_LIMIT_MB', 'WRAITH_RAM_LIMIT_MB')); if (e) mb = e; }
    const restart = getSetting('ramlimitRestart');
    ram.restart = restart === 1 || restart === true || envNum('AL_JIN_RAM_RESTART', 'WRAITH_RAM_RESTART') === '1';
    if (mb > 0) {
      ram.limitBytes = Math.max(64, mb) * 1048576;
      applyHeapCap();
      ram.timer = setTimeout(ramTick, 3000);
      ram.timer.unref?.();
    }
  } catch (e) {
    try { console.error('[limiter:boot]', e.message); } catch {}
  }
})();
