// ---------------------------------------------
//  Al-Jin · modules/x-music.js
//  .spotify <song>   — track card + MP3 from a Spotify-style search API
//  .alexa <song>     — "play this" with a YouTube-music API
//  Each command tries its own API first, then the other one, then Al-Jin's
//  built-in YouTube downloader (.play), so a dead API never ends in an error.
// ---------------------------------------------
import { safe, reply, usage, prefix, argOrQuoted, pick } from '../lib/x.js';
import { httpGetJson, fetchBuffer, BROWSER_USER_AGENT } from '../lib/net.js';
import { getMaxDownloadBytes } from '../core/limits.js';

const HARD_CAP = 100 * 1024 * 1024; // never pull more than 100 MB into memory
const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'track';
const words = (s, n) => {
    const w = String(s || '').trim().split(/\s+/);
    return w.length <= n ? w.join(' ') : `${w.slice(0, n).join(' ')} …`;
};

// ── providers: each returns a normalised track or throws ──────────────
async function fromSpotifyApi(query) {
    const data = await httpGetJson(
        `https://okatsu-rolezapiiz.vercel.app/search/spotify?q=${encodeURIComponent(query)}`,
        { timeout: 20000 },
    );
    const r = data?.status ? data.result : null;
    if (!r?.audio) throw new Error('spotify api: no audio');
    return {
        title: r.title || r.name, artist: r.artist, duration: r.duration,
        link: r.url, cover: r.thumbnails, audio: r.audio, headers: {},
    };
}

async function fromYoutubeApi(query) {
    const data = await httpGetJson(
        `https://api.sayan-nexuswork.workers.dev/music?query=${encodeURIComponent(query)}`,
        { timeout: 25000 },
    );
    if (data?.status !== 'success' || !data.url) throw new Error('youtube api: no audio');
    return {
        title: data.title, artist: data.channel, duration: data.duration,
        views: data.views, cover: data.thumbnail, audio: data.url,
        headers: { Referer: 'https://m.youtube.com/' },
    };
}

async function deliver(sock, chat, msg, t, style) {
    const buffer = await fetchBuffer(t.audio, {
        timeout: 90000,
        maxBytes: Math.min(getMaxDownloadBytes(), HARD_CAP),
        headers: { 'User-Agent': BROWSER_USER_AGENT, ...t.headers },
    });
    if (!buffer?.length) throw new Error('empty audio');

    const lines = style === 'spotify'
        ? [`🎧 *${t.title || 'Unknown title'}*`, t.artist && `👤 ${t.artist}`, t.duration && `⏱ ${t.duration}`, t.link && `🔗 ${t.link}`]
        : [`🎵 *${words(t.title, 20)}*`, t.duration && `⏱ ${t.duration}`, t.views && `👁 ${t.views}`, t.artist && `📺 ${t.artist}`, `\n${pick(['💚', '💙', '💜', '🧡'])} Enjoy the music`];
    const caption = lines.filter(Boolean).join('\n');

    if (t.cover) {
        await sock.sendMessage(chat, { image: { url: t.cover }, caption }, { quoted: msg })
            .catch(() => reply(sock, chat, msg, caption));
    } else {
        await reply(sock, chat, msg, caption);
    }
    await sock.sendMessage(chat, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${clean(t.title)}.mp3`,
    }, { quoted: msg });
}

// Tries each provider in turn; true as soon as one delivered the song.
async function deliverFromChain(sock, chat, msg, query, name, chain) {
    for (const [label, source, style] of chain) {
        try {
            const track = await source(query);
            await deliver(sock, chat, msg, track, style);
            return true;
        } catch (e) {
            console.error(`[x:${name}] ${label} failed:`, e?.message);
        }
    }
    return false;
}

/**
 * The Spotify downloader as a fallback for .play: Spotify API → YouTube-music API.
 * Returns true when the song was sent (never calls .play again, so there is no loop).
 */
export async function spotifyDownload(sock, chat, msg, query) {
    return deliverFromChain(sock, chat, msg, String(query || '').trim(), 'spotify', [
        ['spotify api', fromSpotifyApi, 'spotify'],
        ['youtube api', fromYoutubeApi, 'youtube'],
    ]);
}

async function run(sock, chat, msg, args, name, chain) {
    const query = argOrQuoted(msg, args);
    if (!query) return usage(sock, chat, msg, [`🎵 *${name}* — song search`, `Usage: \`${prefix()}${name} <song or artist>\``, `Example: \`${prefix()}${name} con calma\``]);

    if (await deliverFromChain(sock, chat, msg, query, name, chain)) return;
    // last resort: the built-in YouTube downloader
    const { playCommand } = await import('./ytdlp-commands.js');
    await playCommand(sock, chat, msg, query.split(/\s+/));
}

export const spotify = safe('spotify', (sock, chat, msg, args) => run(sock, chat, msg, args, 'spotify', [
    ['spotify api', fromSpotifyApi, 'spotify'],
    ['youtube api', fromYoutubeApi, 'youtube'],
]));

export const alexa = safe('alexa', (sock, chat, msg, args) => run(sock, chat, msg, args, 'alexa', [
    ['youtube api', fromYoutubeApi, 'youtube'],
    ['spotify api', fromSpotifyApi, 'spotify'],
]));
