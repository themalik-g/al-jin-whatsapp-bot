// ─────────────────────────────────────────────
//  Al-Jin · core/autoheal.js
//  Self-healing for memory. `.ping` shows the container's real memory use; when it sits above the
//  threshold for longer than expected the bot fixes it by itself — exactly what `.restart` does by hand:
//
//    1. after ~45 s above the threshold  → "soft heal": trim caches, run the garbage collector, delete
//                                           leftover temp downloads. Often enough on its own.
//    2. still above after N minutes      → graceful restart (state is flushed first, sessions come back).
//       (near 100 % it does not wait that long; a running download / conversion is given a moment to finish)
//
//  Safety: it never restarts in the first 10 minutes after a start (no restart loops), and never when the
//  memory is held outside the bot (file cache, other programs) because a restart would not free that.
//
//  Settings (environment variables, all optional):
//    AL_JIN_AUTOHEAL=0          switch it off
//    AL_JIN_HEAL_PCT=90         threshold in % of the container's memory limit
//    AL_JIN_HEAL_MINUTES=5      how long it may stay above the threshold before the restart
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { containerMemory } from '../lib/sysinfo.js';
import { trimMemory, botMemory } from './limiter.js';

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : d; };
export const HEAL = {
  on: !/^(0|off|false|no)$/i.test(String(process.env.AL_JIN_AUTOHEAL ?? '1')),
  pct: num(process.env.AL_JIN_HEAL_PCT, 90, 60, 99),
  minutes: num(process.env.AL_JIN_HEAL_MINUTES, 5, 1, 120),
};
const SOFT_AFTER_MS = 45_000;       // when the soft heal runs
const MIN_UPTIME_S = 600;           // never restart sooner than this after a start
const MAX_POSTPONE = 6;             // ticks (≈ 2 min) a restart may wait for running downloads / conversions
const TICK_MS = 20_000;

const DATA_ROOT = process.env.WRAITH_DATA_DIR || process.cwd();
const NOTE_FILE = path.resolve(DATA_ROOT, 'data', 'autoheal.json');
const TMP_DIR = path.resolve(DATA_ROOT, 'data', 'tmp', 'wraith-ytdlp');

const mb = (b) => `${Math.round(b / 1048576)} MB`;

/** Pure state machine — all side effects are injected, so it can be tested with a fake clock. */
export function createAutoHeal(deps) {
  const cfg = { ...HEAL, ...(deps.cfg || {}) };
  const st = { overSince: 0, softDone: false, postponed: 0, said: '', restarting: false, last: null };
  const say = (key, msg) => { if (st.said !== key) { st.said = key; deps.log(msg); } };

  function tick() {
    if (!cfg.on || st.restarting) return 'off';
    const now = deps.now();
    const m = deps.mem();
    // No container limit (plain host): the numbers include every other program → not ours to judge.
    if (!m || m.source === 'host' || !m.limit) return 'no-limit';
    const pct = (m.used / m.limit) * 100;
    st.last = { pct, used: m.used, limit: m.limit, at: now };

    if (pct < cfg.pct - 3) {                       // healthy again (3 % hysteresis)
      if (st.overSince) deps.log(`[autoheal] memory back to ${pct.toFixed(0)} % — all good`);
      st.overSince = 0; st.softDone = false; st.postponed = 0; st.said = '';
      return 'ok';
    }
    if (!st.overSince) {
      if (pct < cfg.pct) return 'watching';
      st.overSince = now;
    }
    const held = now - st.overSince;

    // 1) soft heal
    if (!st.softDone && held >= SOFT_AFTER_MS) {
      st.softDone = true;
      try { deps.softHeal(); } catch {}
      deps.log(`[autoheal] memory ${pct.toFixed(0)} % for ${Math.round(held / 1000)} s — trimmed caches and temp files`);
      return 'soft';
    }

    // 2) restart when it stays high
    const critical = pct >= Math.max(cfg.pct + 4, 95);
    const limitMs = cfg.minutes * 60_000;
    if (held < (critical ? Math.min(limitMs, 90_000) : limitMs)) return 'waiting';

    const bot = deps.bot();                         // { self, kids, launcher, count }
    const ours = (bot.self || 0) + (bot.kids || 0) + (bot.launcher || 0);
    const detail = `container ${mb(m.used)} / ${mb(m.limit)} · bot ${mb(bot.self || 0)}, jobs ${mb(bot.kids || 0)}, launcher ${mb(bot.launcher || 0)}`;

    if (deps.uptime() < MIN_UPTIME_S) {
      say('young', `[autoheal] memory ${pct.toFixed(0)} % but the bot only just started — not restarting (${detail})`);
      return 'young';
    }
    if (ours > 0 && ours / m.used < 0.4) {
      say('foreign', `[autoheal] memory ${pct.toFixed(0)} % is mostly held outside the bot (file cache / other programs) — a restart would not free it (${detail})`);
      try { deps.softHeal(); } catch {}
      st.overSince = now;                           // look again after another full period
      st.softDone = true;
      return 'foreign';
    }
    if (!critical && bot.count > 0 && st.postponed < MAX_POSTPONE) {
      st.postponed++;
      say('busy', `[autoheal] memory ${pct.toFixed(0)} % — waiting for ${bot.count} running job(s) to finish before restarting`);
      return 'busy';
    }
    st.restarting = true;
    deps.log(`[autoheal] memory ${pct.toFixed(0)} % for ${Math.round(held / 60000 * 10) / 10} min — restarting to free it (${detail})`);
    deps.restart({ pct: Math.round(pct), heldSec: Math.round(held / 1000), at: now });
    return 'restart';
  }
  return { tick, state: st, cfg };
}

// ── real wiring ──────────────────────────────
function rssOfPid(pid) {
  try {
    const f = fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ');
    return (parseInt(f[1], 10) || 0) * 4096;
  } catch { return 0; }
}

function cleanTmp() {
  try {
    const cutoff = Date.now() - 60_000;
    for (const f of fs.readdirSync(TMP_DIR)) {
      const p = path.join(TMP_DIR, f);
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  } catch { /* no temp folder */ }
}

let started = null;
export function startAutoHeal() {
  if (started || !HEAL.on) return started;
  const heal = createAutoHeal({
    mem: () => containerMemory(),
    bot: () => { const b = botMemory(); return { ...b, launcher: process.ppid > 1 ? rssOfPid(process.ppid) : 0 }; },
    softHeal: () => { trimMemory(); cleanTmp(); },
    uptime: () => process.uptime(),
    now: () => Date.now(),
    log: (m) => { try { console.warn(m); } catch {} },
    restart: (info) => {
      try { fs.mkdirSync(path.dirname(NOTE_FILE), { recursive: true }); fs.writeFileSync(NOTE_FILE, JSON.stringify(info)); } catch {}
      const done = () => setTimeout(() => process.exit(0), 300);
      // flush what must survive (message store, credentials), but never hang on it
      Promise.race([
        Promise.resolve().then(() => globalThis.__aljinFlush?.()),
        new Promise((r) => setTimeout(r, 4000)),
      ]).then(done, done);
    },
  });
  const timer = setInterval(() => { try { heal.tick(); } catch (e) { try { console.error('[autoheal]', e.message); } catch {} } }, TICK_MS);
  timer.unref?.();
  started = heal;
  return heal;
}

/** For `.ping`: { on, pct, minutes, lastRestart: {at, pct} | null, high: {pct, heldSec} | null } */
export function autoHealStatus() {
  let lastRestart = null;
  try { lastRestart = JSON.parse(fs.readFileSync(NOTE_FILE, 'utf8')); } catch {}
  const st = started?.state;
  return {
    on: HEAL.on, pct: HEAL.pct, minutes: HEAL.minutes, lastRestart,
    high: st?.overSince ? { pct: Math.round(st.last?.pct || 0), heldSec: Math.round((Date.now() - st.overSince) / 1000) } : null,
  };
}
