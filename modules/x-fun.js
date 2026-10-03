// ─────────────────────────────────────────────
//  Al-Jin · modules/x-fun.js
//  8ball · ship · rate · compliment · insult · flirt · truth · dare
//  games: tictactoe · hangman · guess · rps
//  reactions: hug kiss pat cry poke wink nom   (free GIF APIs, no key)
// ─────────────────────────────────────────────
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import { reply, safe, pick, stableScore, bar, targetJid, tag, senderJid, withTmp, ffmpeg, contextOf } from '../lib/x.js';
import { httpGetJson, fetchBuffer } from '../lib/net.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();
const q = (args) => args.join(' ').trim();

// ── 8ball ──────────────────────────────────────
const BALL = [
    ['It is certain.', 1], ['Without a doubt.', 1], ['You may rely on it.', 1], ['Yes, definitely.', 1], ['Most likely.', 1], ['Signs point to yes.', 1],
    ['Reply hazy, try again.', 0], ['Ask again later.', 0], ['Better not tell you now.', 0], ['Cannot predict now.', 0],
    ['Don’t count on it.', -1], ['My sources say no.', -1], ['Very doubtful.', -1], ['Outlook not so good.', -1],
];
export const eightball = safe('8ball', async (sock, chat, msg, args) => {
    if (!q(args)) return reply(sock, chat, msg, `🎱 Ask a yes/no question: \`${P()}8ball will I pass?\``);
    const [ans, tone] = pick(BALL);
    return reply(sock, chat, msg, `🎱 *${q(args).slice(0, 150)}*\n\n${tone > 0 ? '🟢' : tone < 0 ? '🔴' : '🟡'} ${ans}`);
});

// ── ship / rate ────────────────────────────────
function names(sock, msg, args) {
    const ctx = contextOf(msg);
    const m = ctx?.mentionedJid || [];
    if (m.length >= 2) return { a: tag(m[0]), b: tag(m[1]), mentions: m.slice(0, 2) };
    if (m.length === 1) return { a: tag(senderJid(msg)), b: tag(m[0]), mentions: [senderJid(msg), m[0]] };
    const text = args.join(' ').split(/\s*(?:&|\+|x|and|,)\s*/i).filter(Boolean);
    return text.length >= 2 ? { a: text[0], b: text[1], mentions: [] } : null;
}
const SHIP_NOTE = [[20, 'Just friends at best 😅'], [40, 'Needs some work 🛠️'], [60, 'There is a spark ✨'], [80, 'Great match 💞'], [101, 'Written in the stars 💘']];
export const ship = safe('ship', async (sock, chat, msg, args) => {
    const n = names(sock, msg, args);
    if (!n) return reply(sock, chat, msg, `💞 Usage: \`${P()}ship @a @b\` or \`${P()}ship Ali & Sara\``);
    const pct = stableScore(n.a, n.b);
    return reply(sock, chat, msg, `💞 *${n.a}* × *${n.b}*\n\n${bar(pct)} *${pct}%*\n${SHIP_NOTE.find(([m]) => pct < m)[1]}`, { mentions: n.mentions });
});

const RATES = { default: '⭐ rating', gay: '🌈 rainbow meter', simp: '🥺 simp meter', smart: '🧠 brain power', lucky: '🍀 luck', cool: '😎 coolness', brave: '🦁 bravery' };
export const rate = safe('rate', async (sock, chat, msg, args) => {
    const kind = RATES[(args[0] || '').toLowerCase()] ? args.shift().toLowerCase() : 'default';
    const t = targetJid(msg, []);
    const label = t ? tag(t) : (q(args) || 'you');
    const pct = stableScore(`${kind}:${label}`, new Date().toISOString().slice(0, 10));
    return reply(sock, chat, msg, `${RATES[kind]}\n*${label}*\n\n${bar(pct)} *${pct}%*\n_(changes daily · just for fun)_`, { mentions: t ? [t] : [] });
});

// ── lines ──────────────────────────────────────
const COMPLIMENTS = [
    'You make hard things look easy.', 'Your curiosity is contagious.', 'People feel better after talking to you.', 'You have a great sense of humour.',
    'You bring calm into messy situations.', 'Your effort never goes unnoticed.', 'You are the kind of friend everyone wishes for.',
    'Your ideas are sharper than you give yourself credit for.', 'You make the group chat better just by being in it.', 'You light up a room without trying.',
];
const INSULTS = [
    'You are the human version of a loading screen.', 'Your Wi-Fi signal has more personality than your argument.', 'You bring a lot of energy… to the wrong conversations.',
    'You have the confidence of a man who has never read the manual.', 'Your plans are like your phone battery: always at 3%.', 'You’re proof that autocorrect can’t fix everything.',
    'If common sense were a feature, you’d be on the waiting list.', 'You’d lose a staring contest with a screensaver.',
];
const FLIRTS = [
    'Are you a keyboard? Because you’re exactly my type.', 'Do you believe in love at first text, or should I send it again?', 'Is your name Google? Because you have everything I’ve been searching for.',
    'You must be a good signal — I’m feeling a strong connection.', 'Are you Wi-Fi? Because I’m feeling a connection.', 'Call me a bot, but I think we have good chemistry.',
];
const TRUTHS = [
    'What is a small thing that instantly ruins your mood?', 'What is the last lie you told?', 'What app do you waste the most time on?', 'Which skill do you wish you had right now?',
    'What is the most embarrassing thing in your gallery?', 'What is something you pretend to understand but don’t?', 'Who in this chat do you reply to the fastest?',
    'What is your most unpopular opinion?', 'What was your biggest fear as a child?', 'What is the best compliment you ever received?',
];
const DARES = [
    'Send a voice note singing the first song that comes to mind.', 'Change your WhatsApp status to “I lost a bet” for one hour.', 'Text the 5th contact in your list “good morning” right now.',
    'Do 15 push-ups and send proof.', 'Speak only in questions for the next 10 minutes.', 'Send the last photo you took (no cheating).',
    'Write a two-line poem about the person above you in the chat.', 'Use only emojis to describe your day.', 'Say the alphabet backwards in a voice note.',
];

function lineCommand(emoji, title, pool, withTarget = true) {
    return safe(title, async (sock, chat, msg, args) => {
        const t = withTarget ? targetJid(msg, args) : null;
        const text = `${emoji} ${t ? `${tag(t)}, ` : ''}${pick(pool)}`;
        return reply(sock, chat, msg, text, { mentions: t ? [t] : [] });
    });
}
export const compliment = lineCommand('💐', 'compliment', COMPLIMENTS);
export const insult = lineCommand('🔥', 'insult', INSULTS);
export const flirt = lineCommand('😏', 'flirt', FLIRTS);
export const truth = lineCommand('🧐', 'truth', TRUTHS, false);
export const dare = lineCommand('😈', 'dare', DARES, false);

// ── rock paper scissors ────────────────────────
const RPS = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export const rps = safe('rps', async (sock, chat, msg, args) => {
    const alias = { r: 'rock', p: 'paper', s: 'scissors' };
    const me = alias[(args[0] || '').toLowerCase()] || (args[0] || '').toLowerCase();
    if (!RPS[me]) return reply(sock, chat, msg, `Usage: \`${P()}rps rock|paper|scissors\``);
    const bot = ['rock', 'paper', 'scissors'][randomInt(0, 3)];
    const res = me === bot ? 'It’s a draw 🤝' : BEATS[me] === bot ? 'You win 🎉' : 'I win 😎';
    return reply(sock, chat, msg, `${RPS[me]} you  vs  ${RPS[bot]} me\n\n*${res}*`);
});

// ── number guessing ────────────────────────────
const guessGames = new Map(); // chat → { n, tries, at }
export const guess = safe('guess', async (sock, chat, msg, args) => {
    const g = guessGames.get(chat);
    const sub = (args[0] || '').toLowerCase();
    if (!g || sub === 'start' || sub === 'new' || Date.now() - g.at > 15 * 60000) {
        guessGames.set(chat, { n: randomInt(1, 101), tries: 0, at: Date.now() });
        if (guessGames.size > 200) guessGames.delete(guessGames.keys().next().value);
        return reply(sock, chat, msg, `🔢 I picked a number between *1 and 100*.\nGuess with \`${P()}guess <number>\``);
    }
    const n = parseInt(sub, 10);
    if (!Number.isInteger(n) || n < 1 || n > 100) return reply(sock, chat, msg, `Guess a number from 1 to 100: \`${P()}guess 42\``);
    g.tries++; g.at = Date.now();
    if (n === g.n) { guessGames.delete(chat); return reply(sock, chat, msg, `🎉 Correct! It was *${n}* — solved in ${g.tries} ${g.tries === 1 ? 'try' : 'tries'}.`); }
    if (g.tries >= 10) { guessGames.delete(chat); return reply(sock, chat, msg, `💀 Out of tries. The number was *${g.n}*.`); }
    return reply(sock, chat, msg, `${n < g.n ? '⬆️ higher' : '⬇️ lower'}  (${10 - g.tries} tries left)`);
});

// ── hangman ────────────────────────────────────
const WORDS = ('whatsapp keyboard galaxy pyramid monsoon festival lantern journey compass harvest horizon library notebook mountain thunder '
    + 'umbrella treasure velocity butterfly algorithm champion firewall satellite desert triangle diamond orchestra gravity painter blanket').split(' ');
const STAGES = ['', '😐', '😐\n |', '😐\n/|', '😐\n/|\\', '😐\n/|\\\n/', '😵\n/|\\\n/ \\'];
const hang = new Map();
const drawHang = (h) => `🪢 *hangman*\n\n${STAGES[h.wrong.size] || ''}\n\n\`${[...h.word].map((c) => (h.got.has(c) ? c : '_')).join(' ')}\`\n\nwrong: ${[...h.wrong].join(' ') || '—'}  (${6 - h.wrong.size} left)`;
export const hangman = safe('hangman', async (sock, chat, msg, args) => {
    const a = (args[0] || '').toLowerCase();
    let h = hang.get(chat);
    if (!h || a === 'start' || a === 'new' || Date.now() - h.at > 20 * 60000) {
        h = { word: pick(WORDS), got: new Set(), wrong: new Set(), at: Date.now() };
        hang.set(chat, h);
        if (hang.size > 200) hang.delete(hang.keys().next().value);
        return reply(sock, chat, msg, `${drawHang(h)}\n\nGuess with \`${P()}hangman <letter>\``);
    }
    if (a === 'end') { hang.delete(chat); return reply(sock, chat, msg, `The word was *${h.word}*.`); }
    if (!/^[a-z]$/.test(a)) return reply(sock, chat, msg, `${drawHang(h)}\n\nGuess with \`${P()}hangman <letter>\``);
    h.at = Date.now();
    if (h.got.has(a) || h.wrong.has(a)) return reply(sock, chat, msg, `You already tried *${a}*.`);
    (h.word.includes(a) ? h.got : h.wrong).add(a);
    if ([...h.word].every((c) => h.got.has(c))) { hang.delete(chat); return reply(sock, chat, msg, `🎉 *You got it!* The word is *${h.word}*.`); }
    if (h.wrong.size >= 6) { hang.delete(chat); return reply(sock, chat, msg, `${drawHang(h)}\n\n💀 Game over — the word was *${h.word}*.`); }
    return reply(sock, chat, msg, drawHang(h));
});

// ── tic-tac-toe ────────────────────────────────
const ttt = new Map(); // chat → game
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = (b) => { for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x]; return b.every(Boolean) ? 'draw' : null; };
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const drawBoard = (b) => [0, 3, 6].map((r) => [0, 1, 2].map((c) => (b[r + c] === 'X' ? '❌' : b[r + c] === 'O' ? '⭕' : NUM[r + c])).join('')).join('\n');

export const tictactoe = safe('tictactoe', async (sock, chat, msg, args) => {
    const me = senderJid(msg);
    const g = ttt.get(chat);
    const a = (args[0] || '').toLowerCase();
    if (a === 'end' || a === 'stop') { ttt.delete(chat); return reply(sock, chat, msg, '🛑 game ended.'); }
    if (/^[1-9]$/.test(a)) {
        if (!g || !g.o) return reply(sock, chat, msg, `No active game. Start: \`${P()}ttt @friend\` (or \`${P()}ttt bot\`)`);
        const turnJid = g.turn === 'X' ? g.x : g.o;
        const isMyTurn = g.vsBot ? g.turn === 'X' && me === g.x : (me === turnJid);
        if (!isMyTurn) return reply(sock, chat, msg, g.vsBot && me !== g.x ? '⛔ This is not your game.' : `⏳ It’s ${tag(turnJid)}’s turn.`, { mentions: [turnJid] });
        const i = Number(a) - 1;
        if (g.board[i]) return reply(sock, chat, msg, 'That square is taken.');
        g.board[i] = g.turn; g.turn = g.turn === 'X' ? 'O' : 'X'; g.at = Date.now();
        if (g.vsBot && !winner(g.board)) {
            const free = g.board.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
            const win = (m) => free.find((k) => { const t = [...g.board]; t[k] = m; return winner(t) === m; });
            const mv = win('O') ?? win('X') ?? (g.board[4] ? pick(free) : 4);
            g.board[mv] = 'O'; g.turn = 'X';
        }
        const w = winner(g.board);
        if (w) {
            ttt.delete(chat);
            const line = w === 'draw' ? '🤝 *Draw!*' : `🏆 ${w === 'X' ? tag(g.x) : g.vsBot ? '*the bot*' : tag(g.o)} wins!`;
            return reply(sock, chat, msg, `${drawBoard(g.board)}\n\n${line}`, { mentions: [g.x, g.vsBot ? null : g.o].filter(Boolean) });
        }
        const next = g.turn === 'X' ? g.x : g.o;
        return reply(sock, chat, msg, `${drawBoard(g.board)}\n\n${tag(next)} (${g.turn === 'X' ? '❌' : '⭕'}) — \`${P()}ttt <1-9>\``, { mentions: [next] });
    }
    if (g && Date.now() - g.at < 10 * 60000) return reply(sock, chat, msg, `A game is running:\n${drawBoard(g.board)}\n\n\`${P()}ttt <1-9>\` to play · \`${P()}ttt end\``);
    const opp = a === 'bot' ? 'bot' : targetJid(msg, args);
    if (!opp) return reply(sock, chat, msg, `🎮 Challenge someone: \`${P()}ttt @friend\` or play the bot: \`${P()}ttt bot\``);
    if (opp !== 'bot' && opp === me) return reply(sock, chat, msg, 'Pick someone else 🙂');
    const game = { board: Array(9).fill(null), x: me, o: opp === 'bot' ? me : opp, vsBot: opp === 'bot', turn: 'X', at: Date.now() };
    ttt.set(chat, game);
    if (ttt.size > 100) ttt.delete(ttt.keys().next().value);
    return reply(sock, chat, msg, `🎮 *Tic-Tac-Toe*\n${tag(game.x)} ❌ vs ${game.vsBot ? '🤖 ⭕' : `${tag(game.o)} ⭕`}\n\n${drawBoard(game.board)}\n\n${tag(game.x)} starts — \`${P()}ttt <1-9>\``, { mentions: [game.x, game.o] });
});

// ── reaction GIFs ──────────────────────────────
const REACTIONS = {
    hug: ['hugged', 'hug'], kiss: ['kissed', 'kiss'], pat: ['patted', 'pat'], cry: ['is crying', 'cry'],
    poke: ['poked', 'poke'], wink: ['winked at', 'wink'], nom: ['nommed', 'nom'],
};
async function reactionGifUrl(kind) {
    const tries = [
        async () => (await httpGetJson(`https://api.waifu.pics/sfw/${kind}`)).url,
        async () => (await httpGetJson(`https://nekos.best/api/v2/${kind}`)).results?.[0]?.url,
    ];
    for (const t of tries) { try { const u = await t(); if (u) return u; } catch {} }
    return null;
}
function reactionCommand(kind) {
    const [verb] = REACTIONS[kind];
    return safe(kind, async (sock, chat, msg, args) => {
        const t = targetJid(msg, args);
        const me = senderJid(msg);
        const caption = kind === 'cry' ? `😢 ${tag(me)} ${verb}` : t ? `${tag(me)} ${verb} ${tag(t)}` : `${tag(me)} ${verb} everyone`;
        const url = await reactionGifUrl(kind);
        if (!url) return reply(sock, chat, msg, '⚠️ Could not fetch a GIF right now — try again in a moment.');
        const raw = await fetchBuffer(url, { maxBytes: 8 * 1024 * 1024 });
        const mentions = [me, t].filter(Boolean);
        if (/\.mp4(\?|$)/i.test(url)) return sock.sendMessage(chat, { video: raw, gifPlayback: true, caption, mentions }, { quoted: msg });
        try {
            await withTmp(['.gif', '.mp4'], async (inp, out) => {
                fs.writeFileSync(inp, raw);
                await ffmpeg(['-i', inp, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=max(2\\,trunc(iw/2)*2):max(2\\,trunc(ih/2)*2)', '-an', out], 60000);
                await sock.sendMessage(chat, { video: fs.readFileSync(out), gifPlayback: true, caption, mentions }, { quoted: msg });
            });
        } catch (e) {
            console.error('[x:reaction] gif convert failed:', e.message);
            await sock.sendMessage(chat, { text: `${caption}\n${url}`, mentions }, { quoted: msg });
        }
    });
}
export const hug = reactionCommand('hug');
export const kiss = reactionCommand('kiss');
export const pat = reactionCommand('pat');
export const cry = reactionCommand('cry');
export const poke = reactionCommand('poke');
export const wink = reactionCommand('wink');
export const nom = reactionCommand('nom');
