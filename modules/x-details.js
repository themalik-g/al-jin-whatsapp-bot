// ─────────────────────────────────────────────
//  Al-Jin · modules/x-details.js
//  Menu + `.details` text for the extras pack. Imported by help.js and details.js.
//  [verb, title, description, [usage…], owner?]
// ─────────────────────────────────────────────

import { EFFECTS, EFFECT_NAMES } from '../lib/audio-effects.js';

const GROUP_PROTECT = [
    ['antiword', '🧼 Banned Words', 'Deletes messages containing banned words (non-admins). Action ladder: delete, warn (strikes then kick), kick, or tkick (temporary kick, auto re-add). Alias: antibadword.', ['.antiword on|off', '.antiword add <words…>', '.antiword del <words…>', '.antiword list', '.antiword action delete|warn|kick|tkick [30m]', '.antiword limit <1-10>']],
    ['antitag', '🏷️ Anti Mass-Tag', 'Deletes messages from non-admins that mention more than N people. Same action ladder as antiword.', ['.antitag on|off', '.antitag max <n>', '.antitag action delete|warn|kick|tkick [30m]', '.antitag limit <1-10>']],
    ['antigm', '🚫 Anti Group-Mention', 'Deletes "group mentioned in status" spam from non-admins. Alias: antigstatus.', ['.antigm on|off']],
    ['antifake', '🛡️ Anti Fake Numbers', 'Removes new members whose number starts with a blocked country code.', ['.antifake on|off', '.antifake add|del <codes…>', '.antifake list']],
    ['antiforward', '⏩ Anti Forward', 'Removes forwarded messages from non-admins. Same action ladder as antiword. Aliases: antifw, afw.', ['.antiforward on|off', '.antiforward action delete|warn|kick|tkick [30m]', '.antiforward limit <1-10>']],
    ['muteuser', '🔇 Mute Member', 'Deletes everything a member sends, for a set time or until unmuted (bot must be admin; admins can\'t be muted).', ['.muteuser @user [30m|2h|1d]', 'Reply: .muteuser 1h']],
    ['unmuteuser', '🔊 Unmute Member', 'Lets a muted member talk again.', ['.unmuteuser @user']],
    ['mutelist', '📋 Mute List', 'Shows muted members, time left, and banned-sticker count.', ['.mutelist']],
    ['mutesticker', '🖼️ Ban a Sticker', 'Deletes one specific sticker (exact file) whenever a non-admin sends it.', ['Reply to a sticker: .mutesticker', '.mutesticker list|clear']],
    ['unmutesticker', '✅ Allow a Sticker', 'Un-bans a sticker.', ['Reply to the sticker: .unmutesticker']],
    ['dnd', '🔕 Do Not Disturb', 'Deletes messages from non-admins that tag the bot and replies with your message. Alias: donotdisturb.', ['.dnd on|off', '.dnd <your message>']],
    ['areact', '😀 Auto React', 'Reacts to messages in the group with random emojis.', ['.areact on|off', '.areact emoji 🔥 😂 ❤️']],
    ['filter', '🔁 Group Filters', 'Auto-reply when a trigger word appears in this group.', ['.filter <trigger> | <reply>', '.filter list']],
    ['stop', '🗑️ Remove Filter', 'Deletes a group filter.', ['.stop <trigger>']],
    ['gfilter', '🌐 Global Filters', 'Like .filter but works in every chat.', ['.gfilter <trigger> | <reply>', '.gfilter list'], true],
    ['gstop', '🗑️ Remove Global Filter', 'Deletes a global filter.', ['.gstop <trigger>'], true],
];
const GROUP_TOOLS = [
    ['setgname', '✏️ Set Group Name', 'Renames the group (bot must be admin).', ['.setgname <new name>']],
    ['admins', '👑 List Admins', 'Mentions and lists every admin.', ['.admins [note]']],
    ['link', '🔗 Invite Link', 'Shows the group invite link (bot must be admin).', ['.link']],
    ['inactive', '😴 Inactive Members', 'Lists members who have not spoken for N days (counted since the bot joined).', ['.inactive [days]']],
    ['left', '🚪 Recently Left', 'Shows who left or was removed recently.', ['.left [count]']],
    ['msgs', '💬 Message Count', 'Messages counted per member, or the top chatters.', ['.msgs [@user]', '.msgs top']],
    ['common', '👥 Common Members', 'Members this group shares with another group the bot is in.', ['.common', '.common <number>'], true],
    ['poll', '📊 Create Poll', 'Sends a native WhatsApp poll.', ['.poll Question | A | B | C [--multi]']],
    ['vote', '🗳️ Quick Vote', 'Yes/no vote inside the chat.', ['.vote <question>', '.vote yes|no', '.vote end']],
    ['afk', '💤 Away Status', 'Tells people who tag you that you are away.', ['.afk [reason]']],
];
const BOT = [
    ['ban', '🔨 Ban From Commands', 'Stops a user from using bot commands.', ['.ban @user'], true],
    ['unban', '✅ Unban', 'Lets a banned user use commands again.', ['.unban @user'], true],
    ['banlist', '📋 Ban List', 'Lists banned numbers.', ['.banlist'], true],
    ['pmblocker', '🔒 PM Blocker', 'Notice or block strangers who message the bot privately.', ['.pmblocker warn|off', '.pmblocker block confirm', '.pmblocker allow|disallow @user', '.pmblocker msg <text>'], true],
    ['setcmd', '🔗 Command Alias', 'Create your own short name for any command.', ['.setcmd <alias> <command [args]>'], true],
    ['delcmd', '🗑️ Delete Alias', 'Removes an alias.', ['.delcmd <alias>'], true],
    ['cmds', '📃 Alias List', 'Shows your aliases.', ['.cmds'], true],
    ['cleartmp', '🧹 Clear Temp Files', 'Deletes leftover temporary files.', ['.cleartmp'], true],
    ['clearsession', '🧹 Clear Stale Session Files', 'Removes old re-creatable Signal files (dry run unless confirmed).', ['.clearsession', '.clearsession confirm'], true],
    ['fixkeys', '🔑 Repair Signal Keys', 'Rebuilds Signal keys/sessions to fix "Waiting for this message" errors.', ['.fixkeys [own|all]'], true],
    ['bot', '🤖 AI Chatbot', 'Fast AI chatbot using Groq, Gemini, or keyless models.', ['.bot <message>']],
    ['shutdown', '⏻ Shutdown', 'Stops the bot process.', ['.shutdown confirm'], true],
    ['save', '💾 Save Message', 'Sends the replied message/media/status to your own chat.', ['Reply with .save'], true],
    ['del', '🗑️ Delete Message', 'Deletes the replied message (admins in groups, owner elsewhere). Alias: delete.', ['Reply with .del']],
    ['ison', '📱 On WhatsApp?', 'Checks whether numbers are registered on WhatsApp.', ['.ison <number> [more…]']],
];
const FUN = [
    ['8ball', '🎱 Magic 8-Ball', 'Answers a yes/no question.', ['.8ball <question>']],
    ['ship', '💞 Ship', 'Compatibility meter for two people.', ['.ship @a @b', '.ship Ali & Sara']],
    ['rate', '⭐ Rate', 'Fun daily meter: default, gay, simp, smart, lucky, cool, brave.', ['.rate [kind] [@user|text]']],
    ['compliment', '💐 Compliment', 'Sends a kind line (optionally to someone).', ['.compliment [@user]']],
    ['insult', '🔥 Playful Roast', 'Light-hearted roast. Alias: roast.', ['.insult [@user]']],
    ['flirt', '😏 Flirt Line', 'Cheesy pick-up line.', ['.flirt [@user]']],
    ['truth', '🧐 Truth', 'A truth question.', ['.truth']],
    ['dare', '😈 Dare', 'A dare.', ['.dare']],
    ['rps', '✂️ Rock Paper Scissors', 'Play against the bot.', ['.rps rock|paper|scissors']],
    ['guess', '🔢 Number Guess', 'Guess a number from 1 to 100.', ['.guess', '.guess <number>']],
    ['hangman', '🪢 Hangman', 'Guess the word letter by letter.', ['.hangman', '.hangman <letter>', '.hangman end']],
    ['tictactoe', '🎮 Tic-Tac-Toe', 'Play a friend or the bot. Alias: ttt.', ['.ttt @friend', '.ttt bot', '.ttt <1-9>', '.ttt end']],
    ['hug', '🤗 Hug', 'Reaction GIF.', ['.hug [@user]']],
    ['kiss', '😘 Kiss', 'Reaction GIF.', ['.kiss [@user]']],
    ['pat', '🫶 Pat', 'Reaction GIF.', ['.pat [@user]']],
    ['cry', '😢 Cry', 'Reaction GIF.', ['.cry']],
    ['poke', '👉 Poke', 'Reaction GIF.', ['.poke [@user]']],
    ['wink', '😉 Wink', 'Reaction GIF.', ['.wink [@user]']],
    ['nom', '😋 Nom', 'Reaction GIF.', ['.nom [@user]']],
];
const TOOLS = [
    ['calc', '🧮 Calculator', 'Safe math: + − × ÷ ^ % ! ( ) sqrt sin cos tan log ln abs round pi e.', ['.calc 12*(3+4)^2']],
    ['color', '🎨 Colour Converter', 'HEX / RGB / HSL / name conversion with a swatch.', ['.color #ff8800', '.color 255 136 0', '.color teal']],
    ['base64', '🔤 Base64', 'Encode or decode text.', ['.base64 enc <text>', '.base64 dec <code>']],
    ['hash', '#️⃣ Hash', 'md5, sha1, sha256, sha384, sha512.', ['.hash [algo] <text>']],
    ['morse', '📟 Morse Code', 'Text ⇄ Morse.', ['.morse <text or morse>']],
    ['password', '🔐 Password', 'Strong random password, generated locally.', ['.password [length] [simple]']],
    ['uuid', '🆔 UUID', 'Random UUID v4.', ['.uuid [count]']],
    ['age', '🎂 Age', 'Exact age and days to next birthday.', ['.age 2001-04-23']],
    ['bmi', '⚖️ BMI', 'Body-mass index from weight and height.', ['.bmi 70 175', '.bmi 154lb 5\'9']],
    ['time', '🕒 World Time', 'Current time for a city or time zone.', ['.time tokyo', '.time Europe/Paris']],
    ['budget', '🧾 Budget', 'Private income/expense tracker.', ['.budget +500 salary', '.budget -40 lunch', '.budget list', '.budget reset']],
    ['task', '📝 To-Do', 'Private task list. Alias: todo.', ['.task add <text>', '.task done|undo|del <n>', '.task clear']],
];
const WEB = [
    ['translate', '🌐 Translate', 'Translate text or a replied message. Alias: trt.', ['.translate fr good morning', '.translate ur (reply)']],
    ['trivia', '🧠 Trivia', 'Random multiple-choice question.', ['.trivia', '.trivia a|b|c|d']],
    ['quote', '💭 Quote', 'Random quote.', ['.quote']],
    ['whois', '🔎 WHOIS / RDAP', 'Registration info for a domain or IP.', ['.whois example.com', '.whois 8.8.8.8']],
    ['github', '🐙 GitHub', 'User or repository card. Alias: git.', ['.github torvalds', '.github nodejs/node']],
    ['crypto', '🪙 Crypto Price', 'Price and 24h change (CoinGecko).', ['.crypto btc', '.crypto eth eur']],
    ['pokedex', '🔴 Pokédex', 'Pokémon info and stats. Alias: pokemon.', ['.pokedex pikachu']],
    ['anime', '🎌 Anime', 'Anime info (MyAnimeList via Jikan).', ['.anime naruto']],
    ['character', '🦸 Anime Character', 'Character info.', ['.character luffy']],
];
const MEDIA = [
    ['take', '🏷️ Sticker Pack Rename', 'Re-sends a sticker with your pack name and author.', ['Reply to a sticker: .take Pack | Author']],
    ['stickercrop', '✂️ Sticker (cropped)', 'Image/video → square-cropped sticker. Alias: scrop.', ['Reply to media: .stickercrop']],
    ['circle', '⚪ Circle Sticker', 'Image → round sticker.', ['Reply to an image: .circle']],
    ['attp', '🔤 Animated Text Sticker', 'Colour-cycling text sticker.', ['.attp <text>']],
    ['blur', '🌫️ Blur', 'Blurs an image.', ['Reply to an image: .blur [1-40]']],
    ['greyscale', '⚫ Greyscale', 'Black-and-white image. Alias: bw.', ['Reply to an image: .greyscale']],
    ['pixelate', '🟦 Pixelate', 'Pixel-art effect.', ['Reply to an image: .pixelate [4-120]']],
    ['speed', '⏩ Speed', 'Change audio/video speed.', ['Reply to media: .speed 1.5']],
    ['treble', '🎚️ Treble Boost', 'Boosts high frequencies.', ['Reply to audio: .treble [dB]']],
    ['reverse', '⏪ Reverse', 'Plays audio/video backwards (short clips).', ['Reply to media: .reverse']],
    ['pitch', '🎶 Pitch Shift', 'Changes pitch, keeps speed.', ['Reply to audio: .pitch 4']],
    ['avm', '🎬 Audio → Video', 'Waveform video from a voice note.', ['Reply to audio: .avm']],
    ['subtitle', '💬 Auto Subtitles', 'Transcribes the speech in a video and burns subtitles into it. Styles: youtube, netflix, bold, neon, redbox, gold, comic, minimal. Fonts: F1–F8 (see .subtitle fonts). Also top/mid/bottom, small/big, a 2-letter language code (ur, en, hi…), or srt for just the .srt file. Needs a free GROQ_API_KEY, GEMINI_API_KEY or DEEPGRAM_API_KEY — the bot falls back between them. Aliases: subtitles, subs, sub.', ['Reply to a video: .subtitle', '.subtitle netflix F2', '.subtitle neon F3 top big', '.subtitle bold ur', '.subtitle srt', '.subtitle fonts']],
    ['pdf', '📄 PDF Maker', 'Text, one photo, or many photos → PDF. Alias: topdf.', ['.pdf <text>', 'Reply to a photo: .pdf', '.pdf add … .pdf make [name]']],
    ['trb', '🎙️ Transcribe Audio', 'Transcribes speech in audio/voice note to text.', ['Reply to audio: .trb']],
    ['movie', '🎬 Movie Downloader', 'Searches and streams movies or series directly.', ['.movie <title>']],
    ['movieinfo', 'ℹ️ Movie Info', 'Shows plot and info for a movie.', ['.movieinfo <title>']],
    ['series', '📺 Series Downloader', 'Searches and streams TV series.', ['.series <title>']],
    ['continue', '▶️ Continue Search', 'Loads more results for movie search.', ['.continue']],
    ['mvp', '🎬 Pick Movie', 'Selects a title from search results.', ['.mvp <number>']],
    ['mvq', '🎬 Pick Quality', 'Selects quality or episode number.', ['.mvq <number>']],
];

const EFFECT_ROWS = [
    ['fx', '🎛️ Voice Effects List', 'Lists every voice effect. Alias: effects.', ['.fx']],
    ...EFFECT_NAMES.map((n) => [n, `${EFFECTS[n].icon} ${n[0].toUpperCase()}${n.slice(1)}`, `${EFFECTS[n].desc} Works on voice notes, audio and video (audio is returned).`, [`Reply to audio/video: .${n}`]]),
];

const SECTIONS = [
    { id: 'xprotect', icon: '🛡️', title: 'GROUP PROTECTION+', rows: GROUP_PROTECT, adminHint: true },
    { id: 'xgroup', icon: '👥', title: 'GROUP TOOLS+', rows: GROUP_TOOLS },
    { id: 'xbot', icon: '⚙️', title: 'BOT CONTROL+', rows: BOT },
    { id: 'xfun', icon: '🎲', title: 'FUN & GAMES', rows: FUN },
    { id: 'xtools', icon: '🧰', title: 'HANDY TOOLS', rows: TOOLS },
    { id: 'xweb', icon: '🌐', title: 'WEB LOOKUPS', rows: WEB },
    { id: 'xmedia', icon: '🎞️', title: 'MEDIA STUDIO', rows: MEDIA },
    { id: 'xeffects', icon: '🎛️', title: 'VOICE EFFECTS', rows: EFFECT_ROWS },
];

/** Entries for modules/details.js */
export const X_DETAILS = {};
for (const s of SECTIONS) {
    for (const [verb, title, description, usage] of s.rows) X_DETAILS[verb] = { title, description, usage };
}
// alias keys → same details
const ALIASES = {
    antibadword: 'antiword', antifw: 'antiforward', afw: 'antiforward', donotdisturb: 'dnd', effects: 'fx', antigstatus: 'antigm', autoreact: 'areact', listadmin: 'admins', invitelink: 'link', delete: 'del', roast: 'insult', ttt: 'tictactoe',
    calculate: 'calc', colour: 'color', b64: 'base64', genpass: 'password', todo: 'task', trt: 'translate', git: 'github', pokemon: 'pokedex',
    steal: 'take', scrop: 'stickercrop', grayscale: 'greyscale', bw: 'greyscale', topdf: 'pdf',
    subtitles: 'subtitle', subs: 'subtitle', sub: 'subtitle', addsub: 'subtitle',
    transcribe: 'trb', transcript: 'trb', totext: 'trb', chatbot: 'bot',
    movies: 'movie', moviedl: 'movie', minfo: 'movieinfo', tvseries: 'series', seriesdl: 'series', cont: 'continue',
};
for (const [a, v] of Object.entries(ALIASES)) X_DETAILS[a] = X_DETAILS[v];

/** Categories for modules/help.js — [{ id, icon, title, commands:[{cmd, ownerOnly}] }] */
export const X_MENU = SECTIONS.map((s) => ({
    id: s.id,
    icon: s.icon,
    title: s.title,
    commands: s.rows.map(([verb, , , usage, owner]) => ({ cmd: usage[0].startsWith('.') ? usage[0] : `.${verb}`, ownerOnly: !!owner })),
}));
