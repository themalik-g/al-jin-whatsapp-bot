// ─────────────────────────────────────────────
// Al-Jin · modules/fun.js
//   .fancy <text>   fancy Unicode fonts        .dice [2d6+1]   roll dice        .coin [n]   flip coins
// No dependencies, no network, nothing kept in memory.
// ─────────────────────────────────────────────
import { randomInt } from 'node:crypto';

const mk = (U, L, D, ex = {}) => (ch) => {
    if (ex[ch]) return ex[ch];
    const c = ch.codePointAt(0);
    if (U != null && c >= 65 && c <= 90) return String.fromCodePoint(U + c - 65);
    if (L != null && c >= 97 && c <= 122) return String.fromCodePoint(L + c - 97);
    if (D != null && c >= 48 && c <= 57) return String.fromCodePoint(D + c - 48);
    return ch;
};

const SMALL = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };

const STYLES = [
    ['Bold', mk(0x1D400, 0x1D41A, 0x1D7CE)],
    ['Italic', mk(0x1D434, 0x1D44E, null, { h: 'ℎ' })],
    ['Bold italic', mk(0x1D468, 0x1D482, 0x1D7CE)],
    ['Script', mk(0x1D4D0, 0x1D4EA, 0x1D7CE)],
    ['Fraktur', mk(0x1D56C, 0x1D586, 0x1D7CE)],
    ['Double-struck', mk(0x1D538, 0x1D552, 0x1D7D8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
    ['Sans', mk(0x1D5A0, 0x1D5BA, 0x1D7E2)],
    ['Sans bold', mk(0x1D5D4, 0x1D5EE, 0x1D7EC)],
    ['Sans italic', mk(0x1D608, 0x1D622, 0x1D7E2)],
    ['Sans bold italic', mk(0x1D63C, 0x1D656, 0x1D7EC)],
    ['Monospace', mk(0x1D670, 0x1D68A, 0x1D7F6)],
    ['Wide', (ch) => (ch === ' ' ? '\u3000' : mk(0xFF21, 0xFF41, 0xFF10)(ch))],
    ['Circled', (ch) => {
        const c = ch.codePointAt(0);
        if (c >= 65 && c <= 90) return String.fromCodePoint(0x24B6 + c - 65);
        if (c >= 97 && c <= 122) return String.fromCodePoint(0x24D0 + c - 97);
        if (c >= 49 && c <= 57) return String.fromCodePoint(0x2460 + c - 49);
        if (c === 48) return '⓪';
        return ch;
    }],
    ['Squared', mk(0x1F130, 0x1F130, null)],
    ['Small caps', (ch) => SMALL[ch] || ch]
];

const render = (fn, text) => Array.from(text).map(fn).join('');

export async function fancyCommand(sock, chat, msg, args) {
    const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage?.conversation || ctx?.quotedMessage?.extendedTextMessage?.text || '';
        let parts = [...(args || [])];
        let pick = null;
        if (parts.length && /^\d{1,2}$/.test(parts[0]) && Number(parts[0]) >= 1 && Number(parts[0]) <= STYLES.length && (parts.length > 1 || quoted)) {
            pick = Number(parts.shift());
        }
        const text = (parts.join(' ') || quoted).slice(0, 80);
        if (!text.trim()) return reply('✨ *fancy*\n\n`.fancy <text>` — all styles\n`.fancy 4 <text>` — one style\n_or reply to a message_');
        if (pick) return reply(render(STYLES[pick - 1][1], text));
        const lines = STYLES.map(([name, fn], i) => `${i + 1}. ${render(fn, text)}`);
        return reply(`✨ *fancy*\n\n${lines.join('\n')}\n\n_Copy the one you like. Pick one only with_ \`.fancy <number> <text>\``);
    } catch (e) { return reply(`⚠️ fancy failed: ${e.message}`).catch(() => {}); }
}

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export async function diceCommand(sock, chat, msg, args) {
    const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const spec = (args?.[0] || '1d6').toLowerCase();
        const m = /^(\d{0,2})d(\d{1,4})([+-]\d{1,4})?$/.exec(spec);
        if (!m) return reply('🎲 Usage: `.dice` · `.dice 2d6` · `.dice d20` · `.dice 3d8+2`');
        const n = Math.min(Number(m[1] || 1), 20);
        const sides = Number(m[2]);
        const bonus = Number(m[3] || 0);
        if (n < 1 || sides < 2) return reply('🎲 A die needs at least 2 sides.');
        const rolls = Array.from({ length: n }, () => randomInt(1, sides + 1));
        const sum = rolls.reduce((a, b) => a + b, 0) + bonus;
        const shown = sides === 6 ? rolls.map((r) => `${FACES[r - 1]} ${r}`).join('  ') : rolls.join(', ');
        const label = `${n}d${sides}${bonus ? (bonus > 0 ? `+${bonus}` : bonus) : ''}`;
        return reply(n === 1 && !bonus ? `🎲 *${label}* → ${shown}` : `🎲 *${label}* → ${shown}\n= *${sum}*`);
    } catch (e) { return reply(`⚠️ dice failed: ${e.message}`).catch(() => {}); }
}

export async function coinCommand(sock, chat, msg, args) {
    const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });
    try {
        const n = Math.min(Math.max(parseInt(args?.[0], 10) || 1, 1), 100);
        if (n === 1) return reply(randomInt(0, 2) ? '🪙 *Heads*' : '🪙 *Tails*');
        let heads = 0;
        const seq = [];
        for (let i = 0; i < n; i++) { const h = randomInt(0, 2) === 1; if (h) heads++; seq.push(h ? 'H' : 'T'); }
        return reply(`🪙 *${n} flips*\n\nHeads · ${heads}\nTails · ${n - heads}\n\n${seq.join(' ')}`);
    } catch (e) { return reply(`⚠️ coin failed: ${e.message}`).catch(() => {}); }
}
