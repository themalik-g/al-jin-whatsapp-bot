// ─────────────────────────────────────────────
// Al-Jin · modules/limits.js   (owner only)
//   .cpulimit               → status
//   .cpulimit 0.30          → cap the bot at 0.30 cores (also: 30%, 1.5)
//   .cpulimit auto          → follow the server's CPU quota (90 % of it)
//   .cpulimit off
//   .ramlimit               → status
//   .ramlimit 512           → RAM ceiling in MB (also: 1gb)
//   .ramlimit 512 restart   → …and restart the bot if it stays over for 20 s
//   .ramlimit off
// Engine: core/limiter.js
// ─────────────────────────────────────────────
import { isOwner } from '../core/identity.js';
import { getPrefix } from '../core/settings.js';
import {
  limiterStatus, setCpuLimit, setRamLimitMB, parseCpuLimit, parseRamLimit,
  containerCores, hasProc, MIN_CPU_CORES,
} from '../core/limiter.js';
import { bar, fmtBytes, qualityPct } from '../lib/sysinfo.js';
import os from 'node:os';

const ownerOnly = async (sock, chat, msg) => {
  const from = msg.key.participant || msg.key.remoteJid;
  if (msg.key.fromMe || isOwner(from)) return true;
  await sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  return false;
};

const coresText = (c) => `${Number(c).toFixed(2)} core${Number(c) === 1 ? '' : 's'} (${Math.round(c * 100)}% of one core)`;
const secs = (ms) => `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;

function cpuStatus() {
  const p = getPrefix();
  const s = limiterStatus();
  const c = s.cpu;
  const quota = containerCores();
  const lines = ['⚙️ *CPU limit*', ''];
  if (c.enabled) {
    const pct = c.limit > 0 ? Math.min(100, (c.usage / c.limit) * 100) : 0;
    lines.push(
      `• Limit: *${coresText(c.limit)}*${c.auto ? ' _(auto)_' : ''}`,
      `• Bot now: *${c.usage.toFixed(2)}* cores  \`${bar(pct)}\` ${qualityPct(pct)}`,
      `• State: ${c.paused ? '⏸ *throttling* (jobs paused to stay under the limit)' : '▶️ running'}`,
      `• Child jobs now: ${c.children}${c.stoppedNow ? ` (${c.stoppedNow} paused)` : ''}`,
      `• Since start: ${c.pauses} throttle bursts · ${secs(c.pausedMs)} paused · ${c.gated} command${c.gated === 1 ? '' : 's'} delayed (${secs(c.gatedMs)} total)`,
    );
    if (c.saturated) lines.push('', `⚠️ _The limit is lower than what the bot uses just idling, so commands may start a little late. Try a higher value._`);
  } else {
    lines.push('• Limit: *off* (no cap)');
  }
  lines.push('', `Server: ${quota ? `container quota *${coresText(quota)}*` : 'no container quota detected'} · ${c.hostCores} host core${c.hostCores === 1 ? '' : 's'}`);
  lines.push(
    '',
    '*Change it*',
    `• \`${p}cpulimit 0.30\` — max 0.30 cores (or \`30%\`)`,
    `• \`${p}cpulimit auto\` — 90% of the server's CPU quota`,
    `• \`${p}cpulimit off\``,
    '',
    `_Heavy jobs (ffmpeg, yt-dlp…) run in short slices, so they finish later but never spike above the limit. ${hasProc() ? '' : 'On this OS only the bot itself is gated; child jobs just get a lower priority. '}Startup/pairing is not throttled._`,
    '',
    'Provided by 𝐀𝐥-𝐉𝐢𝐧',
  );
  return lines.join('\n');
}

function ramStatus() {
  const p = getPrefix();
  const r = limiterStatus().ram;
  const lines = ['💾 *RAM limit*', ''];
  if (r.enabled) {
    const pct = (r.used / (r.limitMB * 1048576)) * 100;
    const state = { ok: '🟢 ok', soft: '🟡 trimming caches', high: '🟠 new commands wait', over: '🔴 over the limit' }[r.state] || r.state;
    lines.push(
      `• Limit: *${r.limitMB} MB*${r.restart ? ' · auto-restart *on*' : ''}`,
      `• Used (bot + child jobs): *${fmtBytes(r.used)}*  \`${bar(pct)}\` ${pct.toFixed(0)}%`,
      `   – bot ${fmtBytes(r.selfRss)} · children ${fmtBytes(r.childRss)}`,
      `• State: ${state}`,
      `• Since start: ${r.gc} cleanups · ${r.killed} runaway job${r.killed === 1 ? '' : 's'} stopped`,
    );
  } else {
    lines.push('• Limit: *off* (no ceiling)', `• Bot uses now: ${fmtBytes(process.memoryUsage().rss)} · server RAM ${fmtBytes(os.totalmem())}`);
  }
  lines.push(
    '',
    '*Change it*',
    `• \`${p}ramlimit 512\` — ceiling in MB (or \`1gb\`)`,
    `• \`${p}ramlimit 512 restart\` — also restart if it stays over for 20 s`,
    `• \`${p}ramlimit off\``,
    '',
    '_At 75% caches are trimmed, at 90% new commands wait for memory to drop, at 100% the biggest runaway job is stopped._',
    '',
    'Provided by 𝐀𝐥-𝐉𝐢𝐧',
  );
  return lines.join('\n');
}

export async function cpulimitCommand(sock, chat, msg, args) {
  if (!(await ownerOnly(sock, chat, msg))) return;
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
  const a0 = String(args?.[0] || '').toLowerCase();
  if (!a0 || a0 === 'status') return reply(cpuStatus());

  if (a0 === 'auto') {
    const q = containerCores();
    if (!q) return reply('❌ No container CPU quota was detected on this server, so `auto` can\'t work. Set a number instead, e.g. `.cpulimit 0.30`.');
    const v = setCpuLimit(Math.max(MIN_CPU_CORES, q * 0.9), { auto: true });
    return reply(`✅ CPU limit is *auto*: *${coresText(v)}* (90% of the ${coresText(q)} quota).`);
  }

  const cores = parseCpuLimit(args.join(' '));
  if (cores === null) return reply('❌ Try `.cpulimit 0.30`, `.cpulimit 30%`, `.cpulimit auto` or `.cpulimit off`');
  if (cores === 0) {
    setCpuLimit(0);
    return reply('✅ CPU limit is *off*. The bot may use whatever the server gives it.');
  }
  if (cores < MIN_CPU_CORES) return reply(`❌ Minimum is ${MIN_CPU_CORES} cores (${MIN_CPU_CORES * 100}%).`);
  const host = os.cpus()?.length || 1;
  const v = setCpuLimit(cores);
  let text = `✅ CPU limit set to *${coresText(v)}*.\n_Heavy jobs now run in short slices — slower, but no spikes above this._`;
  if (v >= host) text += `\n\nℹ️ That's at or above this machine's ${host} core${host === 1 ? '' : 's'}, so it will rarely kick in.`;
  const q = containerCores();
  if (q && v > q) text += `\n\n⚠️ Your server quota is only ${coresText(q)}; the server itself will still throttle you above that. Use \`.cpulimit auto\` to stay under it.`;
  return reply(text);
}

export async function ramlimitCommand(sock, chat, msg, args) {
  if (!(await ownerOnly(sock, chat, msg))) return;
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
  const a0 = String(args?.[0] || '').toLowerCase();
  if (!a0 || a0 === 'status') return reply(ramStatus());

  const restart = args.slice(1).some((x) => /^restart$/i.test(x));
  const mb = parseRamLimit(a0);
  if (mb === null) return reply('❌ Try `.ramlimit 512`, `.ramlimit 1gb`, `.ramlimit 512 restart` or `.ramlimit off`');
  if (mb === 0) {
    setRamLimitMB(0, { restart: false });
    return reply('✅ RAM limit is *off*.');
  }
  if (mb < 64) return reply('❌ Minimum is 64 MB.');
  const v = setRamLimitMB(mb, { restart });
  let text = `✅ RAM limit set to *${Math.round(v)} MB*${restart ? ' with *auto-restart*' : ''}.`;
  if (!restart) text += '\n_Add `restart` to also restart the bot when it stays over the limit for 20 s._';
  const now = process.memoryUsage().rss / 1048576;
  if (now > v * 0.75) text += `\n\n⚠️ The bot already uses about ${Math.round(now)} MB, so cleanups will start right away. Consider a higher value.`;
  text += '\n\n_Tip: the Node heap cap is lowered live on a best-effort basis; a restart applies it fully._';
  return reply(text);
}
