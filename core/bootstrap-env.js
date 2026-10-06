// ─────────────────────────────────────────────
//  Al-Jin · core/bootstrap-env.js
//  MUST be the first import of start.js.
//
//  Problem it fixes: index.js launches the bot with WRAITH_DATA_DIR set to
//  instances/<session>, but `npm start` / `node start.js` did not — so the bot
//  silently used the repo root instead. Two different state/owner.json files
//  existed and editing the "wrong" one changed nothing (alerts kept going to
//  the old owner). Now every launch method resolves the SAME data folder.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no override of real environment variables, strips
// trailing "  # comments"). Makes `npm start` behave exactly like index.js.
function loadDotEnv(file) {
  try {
    if (!fs.existsSync(file)) return;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      else val = val.replace(/\s+#.*$/, '').trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {}
}
loadDotEnv(path.join(root, '.env'));

function sessionFromArgv() {
  const i = process.argv.indexOf('--session');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

if (!process.env.WRAITH_REPO_ROOT) process.env.WRAITH_REPO_ROOT = root;

if (!process.env.WRAITH_DATA_DIR) {
  const sid = sessionFromArgv() || process.env.WRAITH_SESSION_ID || 'main';
  const inst = path.join(root, 'instances', sid);
  const instLinked = fs.existsSync(path.join(inst, 'session', 'creds.json'));
  const legacyLinked = fs.existsSync(path.join(root, 'session', 'creds.json'));
  // Old direct-start installs keep their session in the repo root: stay compatible.
  process.env.WRAITH_DATA_DIR = (legacyLinked && !instLinked) ? root : inst;
  process.env.WRAITH_DATA_DIR_AUTO = '1';
}
