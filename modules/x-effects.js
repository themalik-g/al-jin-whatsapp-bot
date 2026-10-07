// ─────────────────────────────────────────────
//  Al-Jin · modules/x-effects.js        (ffmpeg only — no extra dependency)
//  Voice effects: echo · reverb · nightcore · chipmunk · slowed · deep · drunk
//                 · fast · tremolo · distort · fx (list)
//  Reply to a voice note / audio / video with the command. Video → audio is returned.
//  Filter chains live in lib/audio-effects.js.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import { reply, safe, findMedia, mediaBuffer, withTmp, ffmpeg, ffmpegHasFilter } from '../lib/x.js';
import { EFFECTS, EFFECT_NAMES } from '../lib/audio-effects.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();
const MAX_SECONDS = 300;

function makeEffect(name) {
    const fx = EFFECTS[name];
    return safe(name, async (sock, chat, msg) => {
        const m = findMedia(msg, ['audio', 'video']);
        if (!m) return reply(sock, chat, msg, `${fx.icon} Reply to an audio message or video with \`${P()}${name}\` — ${fx.desc}`);
        const secs = Number(m.node.seconds || 0);
        if (secs > MAX_SECONDS) return reply(sock, chat, msg, `⏱️ Too long for this effect (max ${MAX_SECONDS / 60} min).`);
        for (const f of fx.needs) {
            if (!(await ffmpegHasFilter(f))) return reply(sock, chat, msg, `⚠️ This ffmpeg build has no \`${f}\` filter, so \`${P()}${name}\` can't run here.`);
        }
        const buf = await mediaBuffer(m, 60 * 1024 * 1024);
        await withTmp(['.in', '.mp3'], async (inp, out) => {
            fs.writeFileSync(inp, buf);
            await ffmpeg(['-i', inp, '-vn', '-af', fx.af, '-c:a', 'libmp3lame', '-b:a', '128k', out], 180000);
            await sock.sendMessage(chat, { audio: fs.readFileSync(out), mimetype: 'audio/mpeg' }, { quoted: msg });
        });
    });
}

export const echo = makeEffect('echo');
export const reverb = makeEffect('reverb');
export const nightcore = makeEffect('nightcore');
export const chipmunk = makeEffect('chipmunk');
export const slowed = makeEffect('slowed');
export const deep = makeEffect('deep');
export const drunk = makeEffect('drunk');
export const fast = makeEffect('fast');
export const tremolo = makeEffect('tremolo');
export const distort = makeEffect('distort');

export const fx = safe('fx', (sock, chat, msg) => {
    const lines = EFFECT_NAMES.map((n) => `${EFFECTS[n].icon} \`${P()}${n}\` — ${EFFECTS[n].desc}`);
    return reply(sock, chat, msg, ['🎛️ *Voice effects*', '_Reply to a voice note, audio or video with any of these:_', '', ...lines].join('\n'));
});
