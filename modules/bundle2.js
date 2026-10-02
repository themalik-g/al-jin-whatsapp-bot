// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/bundle2.js
// One entry point for the new commands, so router.js needs a single lazy() line.
// Each command file is only loaded when one of its commands is first used.
// ─────────────────────────────────────────────
const MAP = {
    noaction: ['./noaction.js', 'noactionCommand'],
    statusalert: ['./spy.js', 'statusalertCommand'],
    watch: ['./spy.js', 'watchCommand'],
    ginfo: ['./spy.js', 'ginfoCommand'],
    sticker: ['./stickers.js', 'stickerCommand'],
    toimg: ['./stickers.js', 'toimgCommand'],
    fancy: ['./fun.js', 'fancyCommand'],
    dice: ['./fun.js', 'diceCommand'],
    coin: ['./fun.js', 'coinCommand']
};

export const BUNDLE2_VERBS = Object.keys(MAP);

export async function bundle2Command(sock, chat, msg, verb, args) {
    const entry = MAP[verb];
    if (!entry) return;
    try {
        const mod = await import(entry[0]);
        await mod[entry[1]](sock, chat, msg, args || []);
    } catch (e) {
        console.error(`[bundle2:${verb}]`, e.message);
        await sock.sendMessage(chat, { text: `⚠️ ${verb} failed: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}
