// core/settings.js — persistent JSON-backed settings store
import fs from 'node:fs';
import path from 'node:path';
import { storePath } from './paths.js';

const FILE = () => path.join(storePath(), 'settings.json');

const DEFAULTS = {
  prefix: '.',
};

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    _cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(_cache, null, 2));
  } catch (e) {
    console.error('[settings] persist failed:', e.message);
  }
}

export function getPrefix() {
  return load().prefix || '.';
}

export function setPrefix(p) {
  const s = load();
  s.prefix = p;
  persist();
}

export function getSetting(key) {
  return load()[key];
}

export function setSetting(key, value) {
  const s = load();
  s[key] = value;
  persist();
}

export function getReplyMode() {
  // text    (default) plain text, numbered replies — safe on every WhatsApp client
  // poll              multi-select poll; every newly ticked option runs its command
  // buttons           native-flow buttons (many non-business clients show "Waiting for this message")
  const m = load().replyMode || process.env.WRAITH_REPLY_MODE;
  if (m === 'poll') return 'poll';
  if (m === 'buttons') return 'buttons';
  return 'text';
}

export function setReplyMode(mode) {
  const s = load();
  s.replyMode = mode === 'poll' ? 'poll' : mode === 'buttons' ? 'buttons' : 'text';
  persist();
}
