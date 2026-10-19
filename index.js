#!/usr/bin/env node

// ═══════════════════════════════════════════════
// 🔢 BOT WHATSAPP NUMBER
// Enter digits only — country code included.
// Example: 923001234567
// Please enter you number below for auto pairing code sending
// ═══════════════════════════════════════════════
const BOT_NUMBER = '';

// ═══════════════════════════════════════════════
// 🔑 SESSION ID (optional) — from the Jin pairing site
// Paste your Session ID (JIN_...) to connect WITHOUT pairing again.
// Can also be set as SESSION_ID in .env / panel variables / --session-id=JIN_...
// SESSION_API is the address of the session store; the pairing site fills it in.
// ═══════════════════════════════════════════════
const SESSION_ID = '';
const SESSION_API = '';
// Commands inside the bot (.setsession / .addsession / .kb with a Session ID) need the store address too.
if (SESSION_API && !process.env.SESSION_API) process.env.SESSION_API = SESSION_API;

// ─────────────────────────────────────────────
// Al-Jin · bootstrap launcher (standalone, zero-dep)
// ─────────────────────────────────────────────

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────
// 1. INLINE .env LOADER  (NO dotenv dependency)
//    Runs before anything else touches process.env.
//    Existing env vars (panel/PM2/docker) are NOT overridden.
// ─────────────────────────────────────────────
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;

    const text = fs.readFileSync(file, 'utf8');

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();

      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      if (!key) continue;

      let val = line.slice(eq + 1).trim();

      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      } else {
        // KEY=value   # comment → drop trailing comment
        val = val.replace(/\s+#.*$/, '').trim();
      }

      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.warn(
      '[al-jin] .env load skipped:',
      e.message
    );
  }
}

loadEnvFile(path.join(__dirname, '.env'));

// Al-Jin: AL_JIN_* variables are aliases for the legacy WRAITH_* names.
for (const k of Object.keys(process.env)) {
  if (k.startsWith('AL_JIN_')) {
    const legacy = 'WRAITH_' + k.slice(7);

    if (process.env[legacy] === undefined) {
      process.env[legacy] = process.env[k];
    }
  }
}

// ─────────────────────────────────────────────
// 2. Container-safe default
// ─────────────────────────────────────────────
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '2';
}

// ─────────────────────────────────────────────
// 3. Constants
// ─────────────────────────────────────────────
const SOURCE =
  'https://github.com/themalik-g/al-jin-whatsapp-bot.git';

const BRANCH =
  process.env.WRAITH_BRANCH || 'main';

// BOT_NUMBER above is now the primary manual number.
const HARDCODED_BOT_NUMBER = BOT_NUMBER;

const CLONE_TIMEOUT = 180_000;
const INSTALL_TIMEOUT = 300_000;
const LINK_WAIT_MS = 300_000;
const MAX_RESTARTS = 10;

const ADD_MODE =
  process.argv.includes('--add') ||
  process.argv.includes('--setup');

const PROMPT_TIMEOUT_MS = (() => {
  const n = Number(
    String(
      process.env.WRAITH_PROMPT_TIMEOUT_MS ?? ''
    ).trim()
  );

  return Number.isFinite(n) && n >= 0
    ? n
    : 20_000;
})();

// ─────────────────────────────────────────────
// 4. Styling helpers
// ─────────────────────────────────────────────
const dye = (c, s) =>
  `\x1b[${c}m${s}\x1b[0m`;

const grey = s => dye(90, s);
const cyan = s => dye(36, s);
const violet = s => dye(35, s);
const green = s => dye(32, s);
const yellow = s => dye(33, s);
const red = s => dye(31, s);

const clock = () =>
  grey(
    new Date()
      .toTimeString()
      .slice(0, 8)
  );

const say = (...p) =>
  console.log(
    clock(),
    violet('❯'),
    ...p
  );

const veil = () => {
  console.log();
  console.log(
    violet(' · · · · · · · · · · ·')
  );
  console.log(
    violet(' a l - j i n')
  );
  console.log(
    violet(' · · · · · · · · · · ·')
  );
  console.log();
};

// ─────────────────────────────────────────────
// 5. Configured phone number resolution
//
// Priority:
//   1. CLI --phone / --number
//   2. BOT_NUMBER from top of this file
//   3. null
//
// IMPORTANT:
// WRAITH_PHONE / WRAITH_NUMBER are NOT checked.
// ─────────────────────────────────────────────
const PHONE_RE = /^\d{10,15}$/;

function resolveConfiguredPhone(
  argv = process.argv
) {
  const cli = argv.find(
    a =>
      a.startsWith('--phone=') ||
      a.startsWith('--number=')
  );

  // Explicit CLI number has highest priority.
  if (cli) {
    const raw =
      cli
        .split('=')
        .slice(1)
        .join('=');

    const digits =
      raw.replace(/\D/g, '');

    if (PHONE_RE.test(digits)) {
      return digits;
    }

    console.warn(
      clock(),
      red(
        `ignoring invalid phone value: ${raw}`
      )
    );
  }

  // Manual number at the top of index.js.
  const manual =
    String(
      HARDCODED_BOT_NUMBER || ''
    ).replace(/\D/g, '');

  if (PHONE_RE.test(manual)) {
    return manual;
  }

  return null;
}

const CONFIGURED_PHONE =
  resolveConfiguredPhone();

// ─────────────────────────────────────────────
// 6. Repo / instance helpers
// ─────────────────────────────────────────────
function repoRoot() {
  if (
    fs.existsSync(
      path.join(
        __dirname,
        'start.js'
      )
    )
  ) {
    return __dirname;
  }

  const dir =
    path.join(
      __dirname,
      'wraith'
    );

  if (
    !fs.existsSync(
      path.join(
        dir,
        'start.js'
      )
    )
  ) {
    say(
      yellow(
        'fetching al-jin from origin…'
      )
    );

    // 1) git if it is installed, 2) otherwise download the GitHub zip (no git needed)
    let ok = false;

    try {
      const res = spawnSync(
        'git',
        ['clone', '--depth', '1', '-b', BRANCH, SOURCE, dir],
        { stdio: 'inherit', timeout: CLONE_TIMEOUT }
      );
      ok = res.status === 0;
    } catch {
      ok = false;
    }

    if (!ok) {
      say(yellow('git not available - downloading the bot as an archive instead…'));
      downloadZip(dir);
    }
  }

  return dir;
}

// Download the repo as a .tar.gz and unpack it with the system `tar`
// (built into Windows 10/11, macOS, Linux and Termux). No git, no admin rights.
function downloadZip(dir) {
  const url =
    SOURCE.replace(/\.git$/, '') +
    '/archive/refs/heads/' +
    BRANCH +
    '.tar.gz';

  const tmp = path.join(__dirname, 'al-jin-source.tar.gz');

  const dl = spawnSync(
    process.execPath,
    [
      '-e',
      "const u=process.argv[1],o=process.argv[2];" +
        "fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()})" +
        ".then(b=>require('fs').writeFileSync(o,Buffer.from(b)))" +
        ".catch(e=>{console.error(e.message);process.exit(1)})",
      url,
      tmp,
    ],
    { stdio: 'inherit', timeout: CLONE_TIMEOUT }
  );

  if (dl.status !== 0) {
    throw new Error('could not download ' + url + ' - check your internet connection');
  }

  fs.mkdirSync(dir, { recursive: true });

  const ex = spawnSync(
    'tar',
    ['-xzf', tmp, '-C', dir, '--strip-components=1'],
    { stdio: 'inherit', timeout: CLONE_TIMEOUT }
  );

  try { fs.rmSync(tmp, { force: true }); } catch {}

  if (ex.status !== 0 || !fs.existsSync(path.join(dir, 'start.js'))) {
    throw new Error('could not unpack the downloaded archive (tar failed)');
  }
}

function installDeps(dir) {
  say(
    yellow(
      'installing dependencies…'
    )
  );

  // On Windows npm is npm.cmd, which cannot be spawned without a shell
  // (plain spawnSync('npm') fails there). Use a shell command string on Windows.
  const res =
    process.platform === 'win32'
      ? spawnSync('npm install --omit=dev', {
          cwd: dir,
          stdio: 'inherit',
          timeout: INSTALL_TIMEOUT,
          shell: true,
        })
      : spawnSync('npm', ['install', '--omit=dev'], {
          cwd: dir,
          stdio: 'inherit',
          timeout: INSTALL_TIMEOUT,
        });

  if (res.status !== 0) {
    throw new Error(
      'npm install failed – see output above'
    );
  }

  say(
    green(
      '✓ dependencies locked in'
    )
  );
}

const instDir = (
  root,
  id
) =>
  path.join(
    root,
    'instances',
    id
  );

function makeInstance(
  root,
  id
) {
  const dir =
    instDir(root, id);

  for (
    const name of [
      'session',
      'state',
      'vault',
      'logs',
      'data',
    ]
  ) {
    fs.mkdirSync(
      path.join(
        dir,
        name
      ),
      {
        recursive: true,
      }
    );
  }

  return dir;
}

function migrateLegacy(root) {
  const main =
    instDir(
      root,
      'main'
    );

  for (
    const name of [
      'session',
      'state',
      'vault',
    ]
  ) {
    const src =
      path.join(
        root,
        name
      );

    const dst =
      path.join(
        main,
        name
      );

    if (
      fs.existsSync(src) &&
      !fs.existsSync(dst)
    ) {
      say(
        yellow(
          `migrating legacy /${name} → instances/main/${name}`
        )
      );

      try {
        fs.cpSync(
          src,
          dst,
          {
            recursive: true,
            force: false,
          }
        );
      } catch (e) {
        say(
          red(
            `migration warning: ${e.message}`
          )
        );
      }
    }
  }

  // Auto-import root creds.json if uploaded directly to VPS.
  const rootCreds =
    path.join(
      root,
      'creds.json'
    );

  const mainCreds =
    path.join(
      main,
      'session',
      'creds.json'
    );

  if (
    fs.existsSync(rootCreds) &&
    !fs.existsSync(mainCreds)
  ) {
    say(
      green(
        'found root creds.json — auto-moving to instances/main/session/creds.json'
      )
    );

    try {
      fs.mkdirSync(
        path.join(
          main,
          'session'
        ),
        {
          recursive: true,
        }
      );

      fs.renameSync(
        rootCreds,
        mainCreds
      );
    } catch (e) {
      try {
        fs.copyFileSync(
          rootCreds,
          mainCreds
        );

        fs.unlinkSync(
          rootCreds
        );
      } catch (err) {
        say(
          red(
            `auto-creds migration warning: ${err.message}`
          )
        );
      }
    }
  }
}

const isLinked = (
  root,
  id
) =>
  fs.existsSync(
    path.join(
      root,
      'instances',
      id,
      'session',
      'creds.json'
    )
  );

function listExistingInstances(
  root
) {
  const dir =
    path.join(
      root,
      'instances'
    );

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter(n => {
      try {
        return fs
          .statSync(
            path.join(
              dir,
              n
            )
          )
          .isDirectory();
      } catch {
        return false;
      }
    })
    .filter(n =>
      isLinked(
        root,
        n
      )
    )
    .sort();
}

function nextSessionId(root) {
  const dir =
    path.join(
      root,
      'instances'
    );

  if (!fs.existsSync(dir)) {
    return 'main';
  }

  const used =
    fs
      .readdirSync(dir)
      .filter(n => {
        try {
          return (
            fs
              .statSync(
                path.join(
                  dir,
                  n
                )
              )
              .isDirectory() &&
            isLinked(
              root,
              n
            )
          );
        } catch {
          return false;
        }
      });

  if (
    used.length === 0 ||
    !used.includes('main')
  ) {
    return 'main';
  }

  let maxN = 1;

  for (
    const id of used
  ) {
    const m =
      /^sess(\d+)$/.exec(
        id
      );

    if (m) {
      maxN =
        Math.max(
          maxN,
          parseInt(
            m[1],
            10
          )
        );
    }
  }

  return `sess${maxN + 1}`;
}

// ─────────────────────────────────────────────
// 7. Session spawning
// ─────────────────────────────────────────────
const children =
  new Map();

const restartingSessions =
  new Set();

let shuttingDown =
  false;

let rl = null;

const ask = q =>
  new Promise(
    res =>
      rl.question(
        q,
        a =>
          res(
            a.trim()
          )
      )
  );

// ─────────────────────────────────────────────
// Prompt for a WhatsApp number.
//
// Only used if BOT_NUMBER is empty/invalid.
// ─────────────────────────────────────────────
async function promptNumber(
  label = 'number'
) {
  console.log();

  console.log(
    violet(
      ` ╭─ link a ${label} ─────────────────────╮`
    )
  );

  console.log(
    violet(' │') +
      ' WhatsApp number, digits only ' +
      violet('│')
  );

  console.log(
    violet(' │') +
      grey(
        ' country code + number · 923001234567 '
      ) +
      violet('│')
  );

  console.log(
    violet(
      ' ╰────────────────────────────────────────╯'
    )
  );

  return new Promise(
    resolve => {
      let settled =
        false;

      const finish =
        num => {
          if (settled) {
            return;
          }

          settled = true;
          resolve(num);
        };

      (async () => {
        while (!settled) {
          let raw;

          try {
            raw =
              await ask(
                violet(' ❯ ') +
                  cyan(
                    `${label}: `
                  )
              );
          } catch {
            return;
          }

          if (settled) {
            return;
          }

          const digits =
            raw.replace(
              /\D/g,
              ''
            );

          if (
            !/^\d{10,15}$/.test(
              digits
            )
          ) {
            console.log(
              red(
                ' ✖ must be 10–15 digits'
              )
            );

            continue;
          }

          finish(digits);
          return;
        }
      })();
    }
  );
}

// ONE shared worker process (start.js) hosts every WhatsApp session.
// Sessions are added to it by message, so the code and libraries are loaded once.
let worker = null;
let workerRestarts = 0;
let workerResetTimer = null;
let workerMuted = false;
const workerBacklog = [];
const hosted = new Map();            // sessionId → number (re-sent to a respawned worker)

// Heap limit follows the memory the container really has (cgroup aware):
// 512 MB → 256 MB heap · 1 GB → 512 MB · 2 GB+ → 1 GB. WRAITH_MAX_OLD_SPACE_SIZE overrides.
function defaultHeapMb() {
  let total = os.totalmem();
  for (const f of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const n = Number(fs.readFileSync(f, 'utf8').trim());
      if (Number.isFinite(n) && n > 0 && n < total) total = n;
    } catch {}
  }
  const mb = Math.floor(total / 1048576);
  // Small boxes (≤ 640 MB): 40 % → a 512 MB container gets ~205 MB of heap, leaving room for
  // Node itself, Baileys buffers and one ffmpeg / yt-dlp child. Bigger boxes keep 50 %.
  return Math.max(160, Math.min(1536, Math.round(mb * (mb <= 640 ? 0.4 : 0.5))));
}

// Young-generation size: V8's default (16 MB semi-space ≈ 48 MB young gen) is wasteful on small boxes.
function defaultSemiSpaceMb() {
  const env = Number(process.env.WRAITH_SEMI_SPACE_MB);
  if (Number.isFinite(env) && env > 0) return Math.round(env);
  let total = os.totalmem();
  for (const f of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const n = Number(fs.readFileSync(f, 'utf8').trim());
      if (Number.isFinite(n) && n > 0 && n < total) total = n;
    } catch {}
  }
  return total / 1048576 <= 1100 ? 6 : 16;
}

function ensureWorker(root) {
  if (worker) return worker;

  const maxOldSpace = process.env.WRAITH_MAX_OLD_SPACE_SIZE || String(defaultHeapMb());
  const args = [
    `--max-old-space-size=${maxOldSpace}`,
    `--max-semi-space-size=${defaultSemiSpaceMb()}`,
    '--expose-gc',
  ];
  if (process.env.WRAITH_V8_POOL_SIZE) args.push(`--v8-pool-size=${process.env.WRAITH_V8_POOL_SIZE}`);
  args.push(path.join(root, 'start.js'));

  const env = {
    ...process.env,
    UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '2',
    // glibc keeps one malloc arena per thread and rarely hands memory back → RSS creeps up.
    // Two arenas + an early trim keeps the runtime AND its ffmpeg / yt-dlp children small.
    MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || '2',
    MALLOC_TRIM_THRESHOLD_: process.env.MALLOC_TRIM_THRESHOLD_ || '131072',
    WRAITH_REPO_ROOT: root,
    WRAITH_SESSION_ID: 'main',
    WRAITH_DATA_DIR: instDir(root, 'main'),
  };

  say(cyan(`starting Al-Jin runtime (heap ${maxOldSpace} MB)`));
  const proc = spawn('node', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env });
  worker = proc;

  const route = (stream, dest) => {
    stream.on('data', chunk => {
      if (workerMuted) workerBacklog.push([dest, chunk]);
      else dest.write(chunk);
    });
  };
  route(proc.stdout, process.stdout);
  route(proc.stderr, process.stderr);

  proc.on('message', m => {
    if (m?.type === 'wraith:linked' && m.sessionId) {
      try { children.get(m.sessionId)?.resolveLinked?.(true); } catch {}
    }
    if (m?.type === 'host:deleted' && m.sessionId) {
      hosted.delete(m.sessionId);
      children.delete(m.sessionId);
    }
  });

  proc.on('error', err => console.error(clock(), red('spawn error:'), err.message));

  proc.on('exit', (code, signal) => {
    worker = null;
    for (const rec of children.values()) { try { rec.resolveExit({ code, signal }); } catch {} }
    if (shuttingDown) return;
    if (signal === 'SIGINT' || signal === 'SIGTERM') return;

    workerRestarts++;
    if (workerRestarts > MAX_RESTARTS) {
      say(red(`runtime exceeded max restarts (${MAX_RESTARTS}) — giving up`));
      return;
    }
    const wait = code === 0 ? 1000 : Math.min(1500 * Math.pow(2, workerRestarts - 1), 30_000);
    const why = code === 0 ? 'restarting (update / restart command)' : `crashed (${code !== null ? 'code ' + code : 'signal ' + signal})`;
    say(yellow(`runtime ${why} · retry ${workerRestarts} in ${(wait / 1000).toFixed(1)}s`));
    setTimeout(() => {
      if (shuttingDown || worker) return;
      const w = ensureWorker(root);
      for (const [sid, num] of hosted.entries()) {
        try { w.send({ type: 'host:start', sessionId: sid, number: num || null }); } catch {}
      }
    }, wait);
  });

  clearTimeout(workerResetTimer);
  workerResetTimer = setTimeout(() => { workerRestarts = 0; }, 20_000);
  return proc;
}

function spawnSession(root, id, number) {
  makeInstance(root, id);
  const w = ensureWorker(root);

  say(cyan(`starting session ${id}${number ? ' · +' + number : ''}`));

  let resolveLinked;
  let resolveExit;
  const linkedPromise = new Promise(r => (resolveLinked = r));
  const exitPromise = new Promise(r => (resolveExit = r));

  // `proc` keeps the shape the rest of this launcher expects. Stopping one session
  // goes through the runtime; the shared process itself stops only on shutdown.
  const proc = {
    get pid() { return worker?.pid; },
    kill: (sig) => {
      try { (worker || w).send({ type: 'host:stop', sessionId: id }); } catch {}
      if (sig === 'SIGKILL') { try { worker?.kill('SIGKILL'); } catch {} }
    },
  };

  const rec = {
    number,
    proc,
    restarts: 0,
    resetTimer: null,
    resolveLinked,
    resolveExit,
    mute: () => { workerMuted = true; },
    unmute: () => {
      workerMuted = false;
      for (const [dest, chunk] of workerBacklog) dest.write(chunk);
      workerBacklog.length = 0;
    },
  };

  children.set(id, rec);
  hosted.set(id, number || null);
  try { w.send({ type: 'host:start', sessionId: id, number: number || null }); }
  catch (e) { console.error(clock(), red('could not reach runtime:'), e.message); }

  return { proc, linkedPromise, exitPromise };
}

async function waitForLink(
  spawnResult,
  id
) {
  return Promise.race([
    spawnResult.linkedPromise.then(
      () => 'linked'
    ),

    spawnResult.exitPromise.then(
      ({ code }) => {
        if (code === 0) {
          return 'exited';
        }

        throw new Error(
          `session ${id} exited early with code ${code}`
        );
      }
    ),

    new Promise(
      (_, rej) =>
        setTimeout(
          () =>
            rej(
              new Error(
                `session ${id} link timeout after ${LINK_WAIT_MS / 1000}s`
              )
            ),
          LINK_WAIT_MS
        )
    ),
  ]);
}

function muteAll() {
  for (
    const rec of
      children.values()
  ) {
    rec.mute?.();
  }
}

function unmuteAll() {
  for (
    const rec of
      children.values()
  ) {
    rec.unmute?.();
  }
}

async function linkOne(
  root,
  label,
  presetNumber = null
) {
  let number =
    presetNumber;

  if (number) {
    say(
      cyan(
        `using configured number +${number}`
      )
    );
  } else if (
    !process.stdin.isTTY ||
    !rl
  ) {
    throw new Error(
      'no phone number configured — set BOT_NUMBER at the top of index.js or use --phone=923001234567'
    );
  } else {
    number =
      await promptNumber(
        label
      );
  }

  const id =
    nextSessionId(
      root
    );

  say(
    grey(
      `spawning session ${id} for +${number} — waiting for pairing code…`
    )
  );

  const result =
    spawnSession(
      root,
      id,
      number
    );

  try {
    await waitForLink(
      result,
      id
    );

    console.log(
      green(
        `\n ✔ ${id} linked (+${number})`
      )
    );

    return true;
  } catch (e) {
    console.error(
      red(
        ` ✖ ${e.message}`
      )
    );

    return false;
  }
}

async function wizard(
  root
) {
  console.log();

  console.log(
    violet(
      ' ╭───────────────────────────────────────╮'
    )
  );

  console.log(
    violet(' │') +
      ' Al-Jin · pairing wizard ' +
      violet('│')
  );

  console.log(
    violet(
      ' ╰───────────────────────────────────────╯'
    )
  );

  const firstLabel =
    ADD_MODE
      ? 'new number'
      : 'first number';

  const ok1 =
    await linkOne(
      root,
      firstLabel,
      CONFIGURED_PHONE
    );

  if (!ok1) {
    say(
      red(
        'first number failed — aborting wizard'
      )
    );

    return;
  }

  while (true) {
    if (
      !process.stdin.isTTY
    ) {
      console.log(
        grey(
          ' non-interactive — running linked session(s).\n'
        )
      );

      break;
    }

    muteAll();

    await new Promise(
      r =>
        setTimeout(
          r,
          250
        )
    );

    process.stdout.write(
      '\n'
    );

    const ans =
      await ask(
        violet(' ❯ ') +
          'link another number? ' +
          grey(
            '[y/N]: '
          )
      );

    unmuteAll();

    if (
      !/^y(es)?$/i.test(
        ans
      )
    ) {
      console.log(
        grey(
          ' done — running linked session(s).\n'
        )
      );

      break;
    }

    const ok =
      await linkOne(
        root,
        'next number'
      );

    if (!ok) {
      console.log(
        grey(
          ' aborting further links.\n'
        )
      );

      break;
    }
  }
}

function quiet(sig) {
  if (shuttingDown) {
    return;
  }

  shuttingDown =
    true;

  say(
    grey(
      `${sig} received — shutting down all sessions`
    )
  );

  // One SIGTERM stops the shared runtime; it saves every session first (up to ~3 s).
  if (worker) {
    try { worker.once('exit', () => process.exit(0)); worker.kill('SIGTERM'); } catch {}
    setTimeout(() => process.exit(0), 4000);
  } else {
    process.exit(0);
  }
}

process.on(
  'SIGINT',
  () =>
    quiet('SIGINT')
);

process.on(
  'SIGTERM',
  () =>
    quiet('SIGTERM')
);

// ─────────────────────────────────────────────
// 7b. SESSION_ID restore (Cloudflare Workers KV)
//     Puts the saved login into instances/main/session before the bot starts.
// ─────────────────────────────────────────────
const SESSION_ID_RE = /^JIN_[A-Za-z0-9]{24,64}$/;

function sessionIdConfig() {
  const cli = process.argv.find(a => a.startsWith('--session-id='));
  const id = String(
    (cli ? cli.slice(13) : '') || process.env.SESSION_ID || process.env.JIN_SESSION_ID || SESSION_ID || ''
  ).trim();
  if (!id) return null;
  if (!SESSION_ID_RE.test(id)) {
    return { error: 'SESSION_ID is not valid - it must look like JIN_xxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
  }
  const api = String(
    process.env.SESSION_API || process.env.JIN_SESSION_API || SESSION_API || ''
  ).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(api)) {
    return { error: 'SESSION_API is missing - set the address of your session store' };
  }
  return { id, api };
}

async function restoreFromSessionId(root) {
  const cfg = sessionIdConfig();
  if (!cfg) return;
  if (cfg.error) { say(red('session ID: ' + cfg.error)); return; }
  // the bot process inherits these (used for keeping the stored login fresh)
  process.env.SESSION_ID = cfg.id;
  process.env.SESSION_API = cfg.api;

  const dir = path.join(instDir(root, 'main'), 'session');
  const creds = path.join(dir, 'creds.json');
  const marker = path.join(dir, '.session-id');
  const read = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };

  if (fs.existsSync(creds) && read(marker) === cfg.id) {
    say(grey('session ID: using the saved login'));
    return;
  }

  say(cyan('session ID: fetching your login...'));
  let text = null, err = null;
  for (let i = 0; i < 3 && text === null; i++) {
    try {
      const r = await fetch(cfg.api + '/s/' + cfg.id, { signal: AbortSignal.timeout(15000) });
      if (r.ok) text = await r.text();
      else err = new Error(r.status === 404
        ? 'Session ID not found - check it was copied completely (if you linked a moment ago, wait a minute and restart)'
        : 'session store answered HTTP ' + r.status);
    } catch (e) {
      err = new Error('could not reach the session store (' + (e && e.message) + ')');
    }
    if (text === null && i < 2) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  if (text === null) { say(red('session ID: ' + (err && err.message))); return; }

  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (!j || !j.noiseKey || !j.signedIdentityKey) {
    say(red('session ID: the stored login is not valid'));
    return;
  }

  if (fs.existsSync(creds)) {   // another login is here -> keep it as a backup, never mix two logins
    try { fs.renameSync(dir, dir + '.old-' + Date.now()); }
    catch { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(creds + '.tmp', text);
  fs.renameSync(creds + '.tmp', creds);
  fs.writeFileSync(marker, cfg.id);
  say(green('session ID: login restored - no pairing needed'));
}

// ─────────────────────────────────────────────
// 8. Main entry
// ─────────────────────────────────────────────
(async () => {
  try {
    veil();

    const root =
      repoRoot();

    if (
      !fs.existsSync(
        path.join(
          root,
          'node_modules'
        )
      )
    ) {
      installDeps(root);
    }

    makeInstance(
      root,
      'main'
    );

    migrateLegacy(
      root
    );

    await restoreFromSessionId(root);

    const existing =
      listExistingInstances(
        root
      );

    // ── non-interactive ──
    // Pterodactyl, PM2, systemd, docker
    if (
      !process.stdin.isTTY
    ) {
      if (
        existing.length
      ) {
        say(
          grey(
            `[non-interactive] resuming ${existing.length} session(s): ${existing.join(
              ', '
            )}`
          )
        );

        for (
          const id of
            existing
        ) {
          spawnSession(
            root,
            id,
            null
          );
        }

        return;
      }

      if (
        CONFIGURED_PHONE
      ) {
        say(
          grey(
            `[non-interactive] no sessions found — auto-pairing +${CONFIGURED_PHONE}`
          )
        );

        try {
          const ok =
            await linkOne(
              root,
              'auto',
              CONFIGURED_PHONE
            );

          if (!ok) {
            process.exit(0);
          }
        } catch (e) {
          console.error(
            red(
              `auto-pair failed: ${e.message}`
            )
          );

          process.exit(0);
        }

        return;
      }

      say(
        red(
          '[non-interactive] no linked sessions and no manual phone number configured'
        )
      );

      say(
        grey(
          '  → set SESSION_ID (from the Jin pairing site), or BOT_NUMBER at the top of index.js, or use --phone=923001234567'
        )
      );

      process.exit(0);
    }

    // ── interactive TTY ──
    rl =
      readline.createInterface({
        input:
          process.stdin,
        output:
          process.stdout,
      });

    if (ADD_MODE) {
      for (
        const id of
          existing
      ) {
        spawnSession(
          root,
          id,
          null
        );
      }

      await wizard(
        root
      );

      return;
    }

    if (
      existing.length
    ) {
      say(
        grey(
          `resuming ${existing.length} session(s): ${existing.join(
            ', '
          )}`
        )
      );

      for (
        const id of
          existing
      ) {
        spawnSession(
          root,
          id,
          null
        );
      }

      return;
    }

    await wizard(
      root
    );
  } catch (err) {
    console.error(
      red('FATAL:'),
      err.message
    );

    process.exit(1);
  }
})();
