// ─────────────────────────────────────────────
//  Al-Jin · modules/x-tools.js     (zero dependencies · works offline)
//  calc · color · base64 · hash · morse · password · uuid · age · bmi · time
//  budget · task
// ─────────────────────────────────────────────
import fs from 'node:fs';
import crypto from 'node:crypto';
import { reply, safe, argOrQuoted, store, withTmp, ffmpeg, duration } from '../lib/x.js';
import { userKey } from './x-hooks.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();

// ═════════ calc — recursive-descent parser, no eval ═════════
const FN = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    log: Math.log10, ln: Math.log, exp: Math.exp, sign: Math.sign,
};
const CONST = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

export function evaluate(src) {
    const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^').replace(/,/g, '.').replace(/\s+/g, '');
    if (!s || s.length > 200) throw new Error('expression is empty or too long');
    let i = 0;
    const peek = () => s[i];
    const num = () => {
        const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
        if (!m) throw new Error(`unexpected “${s[i] ?? 'end'}” at ${i + 1}`);
        i += m[0].length; return parseFloat(m[0]);
    };
    function primary() {
        if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw new Error('missing )'); i++; return v; }
        const id = /^[a-z]+/i.exec(s.slice(i));
        if (id) {
            const name = id[0].toLowerCase(); i += name.length;
            if (name in CONST) return CONST[name];
            if (name in FN) {
                if (peek() !== '(') throw new Error(`${name} needs (…)`);
                i++; const v = add(); if (peek() !== ')') throw new Error('missing )'); i++;
                return FN[name](v);
            }
            throw new Error(`unknown “${name}”`);
        }
        return num();
    }
    function postfix() {
        let v = primary();
        while (peek() === '!' || peek() === '%') {
            if (peek() === '!') {
                i++; if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error('factorial needs an integer 0-170');
                let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f;
            } else { i++; v /= 100; }
        }
        return v;
    }
    function power() { const b = postfix(); if (peek() === '^') { i++; return b ** unary(); } return b; }
    function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return power(); }
    function mul() {
        let v = unary();
        while (peek() === '*' || peek() === '/' || peek() === 'x' || peek() === ':') {
            const op = s[i++]; const r = unary();
            if (op === '/' || op === ':') { if (r === 0) throw new Error('division by zero'); v /= r; } else v *= r;
        }
        return v;
    }
    function add() { let v = mul(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = mul(); v = op === '+' ? v + r : v - r; } return v; }
    const out = add();
    if (i < s.length) throw new Error(`unexpected “${s[i]}” at ${i + 1}`);
    if (!Number.isFinite(out)) throw new Error('result is not a finite number');
    return out;
}
const fmtNum = (n) => (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(8) : String(+n.toPrecision(14)));

export const calc = safe('calc', async (sock, chat, msg, args) => {
    const expr = argOrQuoted(msg, args);
    if (!expr) return reply(sock, chat, msg, `🧮 Usage: \`${P()}calc 12*(3+4)^2\`\nSupports + − × ÷ ^ % ! ( ) sqrt sin cos tan log ln abs round pi e`);
    try { return reply(sock, chat, msg, `🧮 ${expr}\n= *${fmtNum(evaluate(expr))}*`); }
    catch (e) { return reply(sock, chat, msg, `🧮 can’t calculate that — ${e.message}`); }
});

// ═════════ color ═════════
const NAMED = { red: '#ff0000', green: '#008000', blue: '#0000ff', black: '#000000', white: '#ffffff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', cyan: '#00ffff', gray: '#808080', brown: '#a52a2a', gold: '#ffd700', teal: '#008080', navy: '#000080', maroon: '#800000', lime: '#00ff00' };
function parseColor(input) {
    const t = input.trim().toLowerCase();
    if (NAMED[t]) return parseColor(NAMED[t]);
    let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
    if (m) { let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); }
    m = /^(?:rgb\()?\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/.exec(t);
    if (m) { const v = m.slice(1, 4).map(Number); if (v.every((x) => x <= 255)) return v; }
    m = /^hsl\(?\s*(\d{1,3})[\s,]+(\d{1,3})%?[\s,]+(\d{1,3})%?\s*\)?$/.exec(t);
    if (m) {
        const [h, s, l] = [Number(m[1]) % 360, Number(m[2]) / 100, Number(m[3]) / 100];
        const a = s * Math.min(l, 1 - l);
        const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
        return [f(0), f(8), f(4)];
    }
    return null;
}
function toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) {
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
export const color = safe('color', async (sock, chat, msg, args) => {
    const rgb = parseColor(argOrQuoted(msg, args));
    if (!rgb) return reply(sock, chat, msg, `🎨 Usage: \`${P()}color #ff8800\` · \`${P()}color 255 136 0\` · \`${P()}color hsl 30 100 50\` · \`${P()}color teal\``);
    const hex = '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
    const [h, s, l] = toHsl(rgb);
    const caption = `🎨 *${hex.toUpperCase()}*\nrgb(${rgb.join(', ')})\nhsl(${h}°, ${s}%, ${l}%)`;
    try {
        await withTmp(['.png'], async (out) => {
            await ffmpeg(['-f', 'lavfi', '-i', `color=c=0x${hex.slice(1)}:s=320x320`, '-frames:v', '1', out], 20000);
            await sock.sendMessage(chat, { image: fs.readFileSync(out), caption }, { quoted: msg });
        });
    } catch { await reply(sock, chat, msg, caption); }
});

// ═════════ base64 / hash / morse ═════════
export const base64 = safe('base64', async (sock, chat, msg, args) => {
    const mode = (args[0] || '').toLowerCase();
    if (!['enc', 'encode', 'dec', 'decode'].includes(mode)) return reply(sock, chat, msg, `Usage: \`${P()}base64 enc <text>\` · \`${P()}base64 dec <code>\` (or reply to a message)`);
    const body = argOrQuoted(msg, args.slice(1));
    if (!body) return reply(sock, chat, msg, 'Give me some text (or reply to a message).');
    if (mode.startsWith('enc')) return reply(sock, chat, msg, Buffer.from(body, 'utf8').toString('base64'));
    const clean = body.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(clean)) return reply(sock, chat, msg, '❌ That is not valid base64.');
    return reply(sock, chat, msg, Buffer.from(clean.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
});

const HASHES = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
export const hash = safe('hash', async (sock, chat, msg, args) => {
    let algo = (args[0] || '').toLowerCase();
    if (HASHES.includes(algo)) args = args.slice(1); else algo = 'sha256';
    const body = argOrQuoted(msg, args);
    if (!body) return reply(sock, chat, msg, `Usage: \`${P()}hash [${HASHES.join('|')}] <text>\``);
    return reply(sock, chat, msg, `#️⃣ *${algo}*\n\`${crypto.createHash(algo).update(body).digest('hex')}\``);
});

const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.', '@': '.--.-.', '-': '-....-' };
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
export const morse = safe('morse', async (sock, chat, msg, args) => {
    const body = argOrQuoted(msg, args);
    if (!body) return reply(sock, chat, msg, `Usage: \`${P()}morse hello world\` or \`${P()}morse .... .. / - .... . .-. .\``);
    if (/^[.\-/\s|]+$/.test(body)) {
        const out = body.trim().split(/\s*(?:\/|\|)\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => UNMORSE[c] ?? '?').join('')).join(' ');
        return reply(sock, chat, msg, `📟 ${out}`);
    }
    const out = body.toLowerCase().split(/\s+/).map((w) => [...w].map((c) => MORSE[c]).filter(Boolean).join(' ')).filter(Boolean).join(' / ');
    return reply(sock, chat, msg, out ? `📟 ${out}` : 'No encodable characters found.');
});

// ═════════ password / uuid ═════════
export const password = safe('password', async (sock, chat, msg, args) => {
    const len = Math.min(Math.max(parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 16, 8), 64);
    const simple = args.includes('simple');
    const sets = simple ? ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789'] : ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+?'];
    const all = sets.join('');
    const chars = sets.map((s) => s[crypto.randomInt(s.length)]);
    while (chars.length < len) chars.push(all[crypto.randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return reply(sock, chat, msg, `🔐 \`${chars.join('')}\`\n_${len} chars${simple ? ', letters+digits' : ', with symbols'} · generated locally, never stored_`);
});

export const uuid = safe('uuid', async (sock, chat, msg, args) => {
    const n = Math.min(Math.max(parseInt(args[0], 10) || 1, 1), 10);
    return reply(sock, chat, msg, Array.from({ length: n }, () => crypto.randomUUID()).join('\n'));
});

// ═════════ age / bmi / time ═════════
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseDob(t) {
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/i.exec(t);
    if (m && MONTHS.includes(m[2].toLowerCase())) return new Date(Date.UTC(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1]));
    return null;
}
export const age = safe('age', async (sock, chat, msg, args) => {
    const dob = parseDob(args.join(' ').trim());
    const now = new Date();
    if (!dob || isNaN(dob) || dob > now) return reply(sock, chat, msg, `🎂 Usage: \`${P()}age 2001-04-23\` · \`${P()}age 23/04/2001\` · \`${P()}age 23 Apr 2001\``);
    let y = now.getUTCFullYear() - dob.getUTCFullYear(), mo = now.getUTCMonth() - dob.getUTCMonth(), d = now.getUTCDate() - dob.getUTCDate();
    if (d < 0) { mo--; d += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate(); }
    if (mo < 0) { y--; mo += 12; }
    let next = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
    if (next <= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))) next = new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate()));
    const days = Math.floor((now - dob) / 86400000);
    const toNext = Math.ceil((next - now) / 86400000);
    return reply(sock, chat, msg, `🎂 *${y}* years, *${mo}* months, *${d}* days\n\n📅 lived: ${days.toLocaleString('en-US')} days\n🎉 next birthday in *${toNext}* day(s)`);
});

export const bmi = safe('bmi', async (sock, chat, msg, args) => {
    const raw = args.join(' ').toLowerCase();
    const usageText = `⚖️ Usage: \`${P()}bmi 70 175\` (kg, cm) · \`${P()}bmi 154lb 5'9\``;
    const w = /(\d+(?:\.\d+)?)\s*(kg|lbs?|)/.exec(raw);
    if (!w) return reply(sock, chat, msg, usageText);
    let kg = parseFloat(w[1]); if (w[2].startsWith('lb')) kg *= 0.45359237;
    const rest = raw.slice(w.index + w[0].length);
    let m = null;
    const ft = /(\d)\s*(?:'|ft|feet)\s*(\d{1,2})?/.exec(rest);
    const h = /(\d+(?:\.\d+)?)\s*(cm|m|)/.exec(rest);
    if (ft) m = (parseInt(ft[1], 10) * 12 + parseInt(ft[2] || '0', 10)) * 0.0254;
    else if (h) { const v = parseFloat(h[1]); m = h[2] === 'm' || v < 3 ? v : v / 100; }
    if (!m || kg < 10 || kg > 400 || m < 0.5 || m > 2.8) return reply(sock, chat, msg, usageText);
    const v = kg / (m * m);
    const cat = v < 18.5 ? 'Underweight' : v < 25 ? 'Normal' : v < 30 ? 'Overweight' : 'Obese';
    return reply(sock, chat, msg, `⚖️ BMI *${v.toFixed(1)}* — ${cat}\n${kg.toFixed(1)} kg · ${(m * 100).toFixed(0)} cm\n_A general screening number, not a diagnosis._`);
});

const TZ_ALIAS = { pakistan: 'Asia/Karachi', karachi: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi', india: 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', uk: 'Europe/London', usa: 'America/New_York', us: 'America/New_York', pst: 'America/Los_Angeles', est: 'America/New_York', uae: 'Asia/Dubai', saudi: 'Asia/Riyadh', makkah: 'Asia/Riyadh', mecca: 'Asia/Riyadh', china: 'Asia/Shanghai', japan: 'Asia/Tokyo', korea: 'Asia/Seoul', germany: 'Europe/Berlin', france: 'Europe/Paris', turkey: 'Europe/Istanbul', egypt: 'Africa/Cairo', nigeria: 'Africa/Lagos', brazil: 'America/Sao_Paulo', australia: 'Australia/Sydney', utc: 'UTC', gmt: 'UTC' };
function findZone(q) {
    const key = q.trim().toLowerCase();
    if (TZ_ALIAS[key]) return TZ_ALIAS[key];
    const norm = key.replace(/\s+/g, '_');
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch {}
    return zones.find((z) => z.toLowerCase() === norm) || zones.find((z) => z.toLowerCase().split('/').pop() === norm) || zones.find((z) => z.toLowerCase().includes(norm)) || null;
}
export const time = safe('time', async (sock, chat, msg, args) => {
    const q = args.join(' ').trim();
    const zone = q ? findZone(q) : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    if (!zone) return reply(sock, chat, msg, `🕒 I don’t know “${q}”. Try a city (\`${P()}time tokyo\`) or a zone (\`${P()}time Europe/Paris\`).`);
    const now = new Date();
    const f = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...opts }).format(now);
    const off = f({ timeZoneName: 'longOffset' }).split(' ').pop().replace('GMT', 'UTC');
    return reply(sock, chat, msg, `🕒 *${zone.replace(/_/g, ' ')}*\n\n${f({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}\n${f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n${off === 'UTC' ? 'UTC' : off}`);
});

// ═════════ personal: budget / task ═════════
const personal = () => store('personal', {});
const room = (kind, key) => { const s = personal(); const root = (s.data[kind] ||= {}); return (root[key] ||= []); };
const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const budget = safe('budget', async (sock, chat, msg, args) => {
    const key = userKey(msg);
    const rows = room('budget', key);
    const save = () => personal().save();
    let sub = (args[0] || '').toLowerCase();
    const total = () => rows.reduce((s, r) => s + r.amt, 0);

    const signed = /^([+-])\s*(\d+(?:\.\d+)?)$/.exec(sub);
    if (['income', 'expense', 'add'].includes(sub) || signed) {
        let amt, rest;
        if (signed) { amt = (signed[1] === '-' ? -1 : 1) * parseFloat(signed[2]); rest = args.slice(1); }
        else { amt = parseFloat(args[1]); rest = args.slice(2); if (!(amt > 0)) return reply(sock, chat, msg, `Usage: \`${P()}budget income 5000 salary\``); if (sub === 'expense') amt = -amt; }
        if (!Number.isFinite(amt) || amt === 0) return reply(sock, chat, msg, 'Amount must be a non-zero number.');
        if (rows.length >= 500) rows.shift();
        rows.push({ amt, note: rest.join(' ').slice(0, 60), at: Date.now() }); save();
        return reply(sock, chat, msg, `${amt > 0 ? '💰 +' : '💸 −'}${money(Math.abs(amt))}${rest.length ? ` · ${rest.join(' ')}` : ''}\nbalance: *${money(total())}*`);
    }
    if (sub === 'del') {
        const n = parseInt(args[1], 10);
        if (!(n >= 1 && n <= rows.length)) return reply(sock, chat, msg, `Usage: \`${P()}budget del <number from list>\``);
        rows.splice(n - 1, 1); save(); return reply(sock, chat, msg, `🗑️ removed. balance: *${money(total())}*`);
    }
    if (sub === 'reset') { rows.length = 0; save(); return reply(sock, chat, msg, '🧾 budget cleared.'); }
    if (sub === 'list' || sub === 'history') {
        if (!rows.length) return reply(sock, chat, msg, 'No entries yet.');
        const start = Math.max(0, rows.length - 15);
        return reply(sock, chat, msg, `🧾 *last entries*\n\n${rows.slice(start).map((r, i) => `${start + i + 1}. ${r.amt > 0 ? '+' : '−'}${money(Math.abs(r.amt))} ${r.note}`).join('\n')}\n\nbalance: *${money(total())}*`);
    }
    const inc = rows.filter((r) => r.amt > 0).reduce((s, r) => s + r.amt, 0);
    const exp = -rows.filter((r) => r.amt < 0).reduce((s, r) => s + r.amt, 0);
    return reply(sock, chat, msg, `🧾 *your budget*\n\nincome  +${money(inc)}\nspent   −${money(exp)}\nbalance *${money(inc - exp)}*\n\n\`${P()}budget +500 salary\` · \`-40 lunch\`\n\`${P()}budget list\` · \`del <n>\` · \`reset\`\n_Private to you; stored on the bot’s server._`);
});

export const task = safe('task', async (sock, chat, msg, args) => {
    const key = userKey(msg);
    const rows = room('tasks', key);
    const save = () => personal().save();
    const sub = (args[0] || '').toLowerCase();
    const show = () => (rows.length ? rows.map((t, i) => `${t.done ? '✅' : '⬜'} ${i + 1}. ${t.text}`).join('\n') : 'Your list is empty.');
    if (sub === 'add') {
        const text = args.slice(1).join(' ').trim().slice(0, 150);
        if (!text) return reply(sock, chat, msg, `Usage: \`${P()}task add buy milk\``);
        if (rows.length >= 100) return reply(sock, chat, msg, 'List is full (100).');
        rows.push({ text, done: false, at: Date.now() }); save();
        return reply(sock, chat, msg, `➕ added #${rows.length}`);
    }
    if (['done', 'undo', 'del'].includes(sub)) {
        const n = parseInt(args[1], 10);
        if (!(n >= 1 && n <= rows.length)) return reply(sock, chat, msg, `Usage: \`${P()}task ${sub} <number>\``);
        if (sub === 'del') rows.splice(n - 1, 1); else rows[n - 1].done = sub === 'done';
        save(); return reply(sock, chat, msg, `📝 *tasks*\n\n${show()}`);
    }
    if (sub === 'clear') { const before = rows.length; const keep = rows.filter((t) => !t.done); rows.length = 0; rows.push(...keep); save(); return reply(sock, chat, msg, `🧹 cleared ${before - keep.length} finished task(s).`); }
    if (sub && sub !== 'list') { // `.task buy milk` shortcut
        rows.push({ text: args.join(' ').slice(0, 150), done: false, at: Date.now() }); save();
        return reply(sock, chat, msg, `➕ added #${rows.length}`);
    }
    return reply(sock, chat, msg, `📝 *tasks*\n\n${show()}\n\n\`${P()}task add <text>\` · \`done|undo|del <n>\` · \`clear\``);
});

void duration;
