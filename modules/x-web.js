// ─────────────────────────────────────────────
//  Al-Jin · modules/x-web.js     (free public APIs · no keys · uses lib/net.js)
//  translate · trivia · quote · whois · github · crypto · pokedex
//  anime · character
// ─────────────────────────────────────────────
import { reply, safe, argOrQuoted, pick, clamp } from '../lib/x.js';
import { httpGetJson, fetchBuffer } from '../lib/net.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();
const enc = encodeURIComponent;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// ═════════ translate ═════════
const LANGS = {
    english: 'en', urdu: 'ur', hindi: 'hi', arabic: 'ar', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', russian: 'ru', turkish: 'tr',
    chinese: 'zh-CN', japanese: 'ja', korean: 'ko', indonesian: 'id', bengali: 'bn', persian: 'fa', farsi: 'fa', pashto: 'ps', punjabi: 'pa', dutch: 'nl', swahili: 'sw', thai: 'th', vietnamese: 'vi',
};
function langCode(w) {
    const t = String(w || '').toLowerCase();
    if (LANGS[t]) return LANGS[t];
    return /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(t) ? t : null;
}
export const translate = safe('translate', async (sock, chat, msg, args) => {
    let target = 'en';
    const first = langCode(args[0]);
    const hasLang = first && (args.length === 1 || args[0].length <= 3 || LANGS[args[0].toLowerCase()]);
    if (hasLang) { target = first; args = args.slice(1); }
    const text = argOrQuoted(msg, args);
    if (!text) return reply(sock, chat, msg, `🌐 Usage: \`${P()}translate fr good morning\` · reply to a message with \`${P()}translate ur\`\nDefault target language: English.`);
    const data = await httpGetJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${enc(target)}&dt=t&q=${enc(text.slice(0, 1500))}`);
    const out = (data?.[0] || []).map((r) => r?.[0]).filter(Boolean).join('');
    if (!out) return reply(sock, chat, msg, '⚠️ Nothing came back — check the language code.');
    return reply(sock, chat, msg, `🌐 *${data?.[2] || 'auto'} → ${target}*\n\n${out}`);
});

// ═════════ trivia ═════════
const trivias = new Map(); // chat → { answer, options, at }
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
export const trivia = safe('trivia', async (sock, chat, msg, args) => {
    const t = trivias.get(chat);
    const a = (args[0] || '').toLowerCase();
    const pickIdx = /^[1-4]$/.test(a) ? Number(a) - 1 : /^[a-d]$/.test(a) ? 'abcd'.indexOf(a) : -1;
    if (t && pickIdx >= 0) {
        trivias.delete(chat);
        const ok = pickIdx === t.options.indexOf(t.answer);
        return reply(sock, chat, msg, ok ? `✅ Correct! *${t.answer}*` : `❌ Not quite. The answer was *${t.answer}*.`);
    }
    if (t && a === 'skip') { trivias.delete(chat); return reply(sock, chat, msg, `⏭️ It was *${t.answer}*.`); }
    const data = await httpGetJson('https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986');
    const r = data?.results?.[0];
    if (!r) return reply(sock, chat, msg, '⚠️ Trivia service is busy — try again in a few seconds.');
    const answer = dec(r.correct_answer);
    const options = [...r.incorrect_answers.map(dec), answer].sort(() => Math.random() - 0.5);
    trivias.set(chat, { answer, options, at: Date.now() });
    if (trivias.size > 200) trivias.delete(trivias.keys().next().value);
    return reply(sock, chat, msg, `🧠 *${dec(r.category)}* · ${r.difficulty}\n\n${dec(r.question)}\n\n${options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}\n\nAnswer: \`${P()}trivia a\` … \`d\``);
});

// ═════════ quote ═════════
export const quote = safe('quote', async (sock, chat, msg) => {
    for (const fn of [
        async () => { const d = await httpGetJson('https://zenquotes.io/api/random'); return d?.[0] ? [d[0].q, d[0].a] : null; },
        async () => { const d = await httpGetJson('https://api.quotable.io/random'); return d?.content ? [d.content, d.author] : null; },
    ]) {
        try { const r = await fn(); if (r) return reply(sock, chat, msg, `💭 “${r[0]}”\n— *${r[1]}*`); } catch {}
    }
    return reply(sock, chat, msg, '⚠️ Quote services are unreachable right now.');
});

// ═════════ whois (RDAP — domains and IPs) ═════════
const evt = (d, name) => d.events?.find((e) => e.eventAction === name)?.eventDate?.slice(0, 10);
export const whois = safe('whois', async (sock, chat, msg, args) => {
    const q = (args[0] || '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!q) return reply(sock, chat, msg, `🔎 Usage: \`${P()}whois example.com\` · \`${P()}whois 8.8.8.8\``);
    const isIp = /^[\d.]+$/.test(q) || q.includes(':');
    if (!isIp && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(q)) return reply(sock, chat, msg, '❌ That does not look like a domain or an IP address.');
    const d = await httpGetJson(`https://rdap.org/${isIp ? 'ip' : 'domain'}/${enc(q)}`, { headers: { Accept: 'application/rdap+json, application/json' } });
    if (isIp) {
        return reply(sock, chat, msg, `🔎 *${q}*\n\nnetwork: ${d.name || '—'}\nrange: ${d.startAddress || '?'} – ${d.endAddress || '?'}\ncountry: ${d.country || '—'}\ntype: ${d.type || '—'}\nhandle: ${d.handle || '—'}`);
    }
    const registrar = d.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3];
    return reply(sock, chat, msg, `🔎 *${d.ldhName || q}*\n\nregistrar: ${registrar || '—'}\ncreated: ${evt(d, 'registration') || '—'}\nexpires: ${evt(d, 'expiration') || '—'}\nupdated: ${evt(d, 'last changed') || '—'}\nstatus: ${(d.status || []).slice(0, 3).join(', ') || '—'}\nnameservers: ${(d.nameservers || []).map((n) => n.ldhName?.toLowerCase()).slice(0, 4).join(', ') || '—'}`);
});

// ═════════ github ═════════
export const github = safe('github', async (sock, chat, msg, args) => {
    const q = (args[0] || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
    if (!/^[\w.-]+(\/[\w.-]+)?$/.test(q)) return reply(sock, chat, msg, `🐙 Usage: \`${P()}github torvalds\` · \`${P()}github nodejs/node\``);
    const gh = { headers: { Accept: 'application/vnd.github+json' } };
    if (q.includes('/')) {
        const r = await httpGetJson(`https://api.github.com/repos/${q}`, gh);
        return reply(sock, chat, msg, `🐙 *${r.full_name}*\n${cut(r.description, 200) || '_no description_'}\n\n⭐ ${r.stargazers_count.toLocaleString('en-US')}   🍴 ${r.forks_count.toLocaleString('en-US')}   👀 ${r.subscribers_count?.toLocaleString('en-US') ?? '—'}\n🗂️ ${r.language || '—'} · ${r.license?.spdx_id || 'no license'}\n🐞 ${r.open_issues_count} open issues\n🕒 pushed ${r.pushed_at?.slice(0, 10)}\n${r.html_url}`);
    }
    const u = await httpGetJson(`https://api.github.com/users/${q}`, gh);
    const caption = `🐙 *${u.name || u.login}* (@${u.login})\n${cut(u.bio, 160) || ''}\n\n📦 ${u.public_repos} repos   👥 ${u.followers} followers · ${u.following} following\n📍 ${u.location || '—'}\n🗓️ joined ${u.created_at?.slice(0, 10)}\n${u.html_url}`;
    try { return await sock.sendMessage(chat, { image: await fetchBuffer(u.avatar_url, { maxBytes: 3 * 1024 * 1024 }), caption }, { quoted: msg }); }
    catch { return reply(sock, chat, msg, caption); }
});

// ═════════ crypto ═════════
const COIN = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', xrp: 'ripple', doge: 'dogecoin', ada: 'cardano', ton: 'the-open-network', ltc: 'litecoin', usdt: 'tether', trx: 'tron', dot: 'polkadot', avax: 'avalanche-2', shib: 'shiba-inu', link: 'chainlink', xmr: 'monero' };
export const crypto = safe('crypto', async (sock, chat, msg, args) => {
    const sym = (args[0] || '').toLowerCase();
    if (!sym) return reply(sock, chat, msg, `🪙 Usage: \`${P()}crypto btc\` · \`${P()}crypto eth eur\``);
    const cur = (args[1] || 'usd').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5) || 'usd';
    let id = COIN[sym];
    if (!id) {
        const s = await httpGetJson(`https://api.coingecko.com/api/v3/search?query=${enc(sym)}`);
        id = s?.coins?.[0]?.id;
        if (!id) return reply(sock, chat, msg, `❌ No coin found for “${sym}”.`);
    }
    const d = (await httpGetJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${cur}&include_24hr_change=true&include_market_cap=true`))?.[id];
    if (!d || d[cur] == null) return reply(sock, chat, msg, `❌ No ${cur.toUpperCase()} price for ${id}.`);
    const ch = d[`${cur}_24h_change`];
    return reply(sock, chat, msg, `🪙 *${id}*\n\n💵 ${d[cur].toLocaleString('en-US', { maximumFractionDigits: d[cur] < 1 ? 6 : 2 })} ${cur.toUpperCase()}\n${ch >= 0 ? '📈' : '📉'} ${ch?.toFixed(2)}% (24h)${d[`${cur}_market_cap`] ? `\n🏦 cap ${Math.round(d[`${cur}_market_cap`]).toLocaleString('en-US')}` : ''}\n_prices: CoinGecko · informational only_`);
});

// ═════════ pokedex ═════════
export const pokedex = safe('pokedex', async (sock, chat, msg, args) => {
    const q = args.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!q) return reply(sock, chat, msg, `🔴 Usage: \`${P()}pokedex pikachu\` · \`${P()}pokedex 25\``);
    const p = await httpGetJson(`https://pokeapi.co/api/v2/pokemon/${q}`);
    const stat = Object.fromEntries(p.stats.map((s) => [s.stat.name, s.base_stat]));
    const caption = `🔴 *${p.name.toUpperCase()}* #${p.id}\n\ntype: ${p.types.map((t) => t.type.name).join(' / ')}\nheight: ${p.height / 10} m · weight: ${p.weight / 10} kg\nabilities: ${p.abilities.map((a) => a.ability.name).join(', ')}\n\nHP ${stat.hp} · ATK ${stat.attack} · DEF ${stat.defense}\nSP.ATK ${stat['special-attack']} · SP.DEF ${stat['special-defense']} · SPD ${stat.speed}`;
    const img = p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default;
    try { return await sock.sendMessage(chat, { image: await fetchBuffer(img, { maxBytes: 4 * 1024 * 1024 }), caption }, { quoted: msg }); }
    catch { return reply(sock, chat, msg, caption); }
});

// ═════════ anime / character (Jikan) ═════════
export const anime = safe('anime', async (sock, chat, msg, args) => {
    const q = args.join(' ').trim();
    if (!q) return reply(sock, chat, msg, `🎌 Usage: \`${P()}anime naruto\``);
    const a = (await httpGetJson(`https://api.jikan.moe/v4/anime?q=${enc(q)}&limit=1&sfw=true`))?.data?.[0];
    if (!a) return reply(sock, chat, msg, '❌ No anime found.');
    const caption = `🎌 *${a.title}*${a.title_japanese ? ` (${a.title_japanese})` : ''}\n\n⭐ ${a.score ?? 'n/a'} · ${a.type || '—'} · ${a.episodes ?? '?'} eps · ${a.status}\n📅 ${a.aired?.string || '—'}\n🎭 ${(a.genres || []).map((g) => g.name).join(', ') || '—'}\n\n${cut(a.synopsis, 500)}\n\n${a.url}`;
    try { return await sock.sendMessage(chat, { image: await fetchBuffer(a.images.jpg.large_image_url, { maxBytes: 4 * 1024 * 1024 }), caption }, { quoted: msg }); }
    catch { return reply(sock, chat, msg, caption); }
});

export const character = safe('character', async (sock, chat, msg, args) => {
    const q = args.join(' ').trim();
    if (!q) return reply(sock, chat, msg, `🦸 Usage: \`${P()}character luffy\``);
    const c = (await httpGetJson(`https://api.jikan.moe/v4/characters?q=${enc(q)}&limit=1&order_by=favorites&sort=desc`))?.data?.[0];
    if (!c) return reply(sock, chat, msg, '❌ No character found.');
    const caption = `🦸 *${c.name}*${c.name_kanji ? ` (${c.name_kanji})` : ''}\n❤️ ${c.favorites?.toLocaleString('en-US') || 0} favourites\n${c.nicknames?.length ? `aka ${c.nicknames.slice(0, 3).join(', ')}\n` : ''}\n${cut(c.about, 500)}\n\n${c.url}`;
    try { return await sock.sendMessage(chat, { image: await fetchBuffer(c.images.jpg.image_url, { maxBytes: 4 * 1024 * 1024 }), caption }, { quoted: msg }); }
    catch { return reply(sock, chat, msg, caption); }
});

void pick; void clamp;
