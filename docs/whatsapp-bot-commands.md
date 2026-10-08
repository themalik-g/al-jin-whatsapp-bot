# Commands Reference

All commands use the configurable prefix (default: `.`). In **private mode**, commands are owner-only. In **public mode**, non-critical commands are available to everyone.

---

## 👻 Ghost — anti-delete & anti-edit

| Command | Description |
|---|---|
| `.ghost` | Show current ghost status |
| `.ghost on` | Arm anti-delete |
| `.ghost off` | Disarm anti-delete |
| `.ghost edit on` | Arm anti-edit tracking |
| `.ghost edit off` | Disarm anti-edit tracking |

**How it works:** Inbound messages are recorded with text and media in encrypted session memory. When a message is deleted or edited, the original content is revealed.

---

## 👁️ Peek — view-once

| Command | Description |
|---|---|
| `.peek` (reply to view-once) | Reveal view-once media |
| `.peek auto on` | Auto-forward incoming view-once media |
| `.peek auto off` | Disable auto-peek |
| `.peek watch on` | Watch quoted replies to view-once messages |
| `.peek watch off` | Stop quoted watching |
| `.peek dest owner` | Direct reveals to owner DM (default) |
| `.peek dest same` | Direct reveals to originating chat |
| `.peek dest both` | Direct reveals to both owner DM and originating chat |

---

## 🌒 Lurk — status watcher

| Command | Description |
|---|---|
| `.lurk` | Show lurk status |
| `.lurk on` | Auto-view every status update |
| `.lurk off` | Disable auto-view |
| `.lurk react on` | React to status updates |
| `.lurk react off` | Disable status reactions |
| `.lurk download on` | Silently download status media to owner DM |
| `.lurk download off` | Stop status downloads |
| `.lurk emoji <emoji>` | Set custom reaction emoji |
| `.lurk emoji random` | Pick a random emoji per status |
| `.lurk emoji none` | Empty reaction (silent view) |

---

## 📅 Schedule — send later

**Usage:**
```
.schedule <message> <target> dd,mm,yy hour minute am/pm
.schedule <target> dd,mm,yy hour minute am/pm    (reply to a message)
.schedule open dd,mm,yy hour minute am/pm        (schedule group opening)
.schedule close dd,mm,yy hour minute am/pm       (schedule group closing)
```

**Target formats:**
- Phone number — `923001234567`
- @username — `@ali`
- JID — `923001234567@s.whatsapp.net`
- LID — `278713363128439@lid`
- Newsletter — `...@newsletter`

---

## ⬇️ Media & File Downloaders

| Command | Description |
|---|---|
| `.play <query>` | Search YouTube and download audio in MP3 format using `ytdlp-nodejs` |
| `.ytv <query\|url>` | Search or download video from YouTube in 360p/480p SD format (size cap adjustable with `.dlcap`, default 500 MB) using `ytdlp-nodejs` |
| `.video <query\|url>` | Alias for `.ytv` — search or download video from YouTube in 360p/480p SD format |
| `.yt <query\|url>` | Download a YouTube video (alias `.youtube`; same engine as `.ytv`) |
| `.yta <query\|url>` | Download YouTube audio (same engine as `.play`) |
| `.ytdl <url>` | Direct YouTube video/audio downloader using `ytdlp-nodejs` |
| `.dlcap` | Show download limits. `.dlcap 1gb` / `.dlcap 800` sets the max size per download (up to 2000 MB), `.dlcap reset` restores 500 MB, `.dlcap quality 720` sets the max video height (owner only) |
| `.dl <url>` | Download video, audio, or post carousel (`@postfetch/core` + `yt-dlp`) |
| `.pdl <post-url>` | Download post/carousel media items directly via `@postfetch/core` |
| `.pdlzip <post-url>` | Download post/carousel items as a single ZIP archive |
| `.mp3 <url>` | Extract MP3 audio from any video or audio URL |
| `.song <query>` | Download audio from SoundCloud, Apple Music, or Deezer |
| `.gitdl <github-url>` | Download GitHub repository as a ZIP archive |
| `.mfdl <mediafire-url>` | Resolve and download MediaFire files directly |
| `.ig <username\|url>` | Fetch Instagram user profile or download post/carousel (aliases: `.insta`, `.instagram`) |
| `.tiktok <username\|url>` | Fetch TikTok profile info or download photo post/video |
| `.fb <username\|url>` | Fetch Facebook profile info or download video/post |

**Post Carousel Routing:**
URLs containing picture posts or carousels (e.g. Instagram `/p/`, TikTok `/photo/`, Pinterest, Facebook posts) are routed directly to `@postfetch/core`. If `yt-dlp` fails for any URL, `@postfetch/core` is tried as a fallback where appropriate.

---

## 📚 Media & Entertainment

| Command | Description |
|---|---|
| `.book <query>` | Search and download verified free books (Project Gutenberg / Archive.org) |
| `.img <query>` | Search stock images (Wikimedia Commons / Openverse / LoremFlickr) |
| `.gemini <prompt>` | Ask Gemini AI for simple text answers & explanations (or reply to text) |
| `.photo <prompt>` | Generate AI photo from image prompt (Imagen 3 / Pollinations) |
| `.movie <name>` | Free movie downloader: top 5 results → pick → pick quality → file is sent (see [guide](./whatsapp-movie-series-downloader.md)) |
| `.series <name> -ep <n>` / `-full` | Download one episode, or a whole series 3 episodes at a time |
| `.continue` | Send the next 3 episodes of a running `-full` series |
| `.movieinfo <title>` | Movie/show details: rating, plot, release date (iTunes / TVmaze) |
| `.songinfo <query>` | Lookup song details & artwork (Deezer / MusicBrainz) |
| `.lyrics <artist> <title>` | Fetch plain lyrics (LRCLIB / lyrics.ovh) |
| `.ppt <topic>;<subtopics>;<theme>;<slides>` | AI-powered PowerPoint presentation generator (Gemini) |
| `.couplepp` | Get matching couple profile pictures |
| `.textmaker <effect> <text>` | Generate 54 Ephoto360 text effects (`.dragon`, `.space`, `.cyberpunk`, etc.) |

---

## 👥 Admin & Group Management

| Command | Description |
|---|---|
| `.open` | Open group so all members can send messages |
| `.close` | Close group so only admins can send messages |
| `.tagall [message]` | Mention all group members explicitly |
| `.hidetag [message]` | Mention all group members silently |
| `.setgpp` (reply image) | Change group profile picture |
| `.setgdesc <text>` | Change group description |
| `.kick` (reply / num) | Remove member from group |
| `.add <number>` | Add member by phone number |
| `.promote` (reply / num) | Promote member to admin |
| `.demote` (reply / num) | Demote admin to member |
| `.approveall` | Approve all pending group join requests |
| `.declineall` | Decline all pending group join requests |
| `.kickall` | Remove all non-admin members |
| `.kickcc <country_code>` | Remove all members from specific country code |
| `.disappearing off\|24h\|7d\|24d\|90d` | Apply disappearing messages duration in any chat |
| `.mute` / `.unmute` | Mute/unmute group notifications |
| `.archive` / `.unarchive` | Archive/unarchive chat |
| `.clearchat` | Clear chat history |
| `.welcome on\|off` | Toggle welcome message on user join |
| `.goodbye on\|off` | Toggle goodbye message on user leave |
| `.antilink on\|off` | Block and delete link messages |
| `.antispam on\|off` | Block and delete message spam |
| `.antisticker on\|off` | Block and delete sticker spam |
| `.rejectcalls on\|off` | Auto-reject incoming calls |

---

## 👤 Owner & Settings

| Command | Description |
|---|---|
| `.block` (reply / num) | Block user |
| `.unblock` (reply / num) | Unblock user |
| `.blocklist` | Show blocked users list |
| `.unblockall` | Unblock all users |
| `.setstatus <text>` | Post status update to `status@broadcast` |
| `.getstatus <num>` | Fetch user's active status story |
| `.getpair <number>` | Generate pairing code session |
| `.setsession [number]` | Add new session instance by replying to a `creds.json` document (main session only) |
| `.addsession <number>` | Initialize and pair new session instance by phone number (main session only) |
| `.delsession <session_id>` | Terminate and delete session instance (main session only) |
| `.setvar <key> <value>` | Set persistent per-session environment variable (e.g. `.setvar GEMINI_API_KEY ...`) |
| `.getvar <key\|all>` | View session variable(s) |
| `.delvar <key>` | Delete session variable |
| `.setpp` (reply image) | Change bot profile picture |
| `.setabout <text>` | Change bot WhatsApp about bio |
| `.chatstats` | Show chat statistics |
| `.stalk <number>` | Track user online presence updates |
| `.setowner <number\|me>` | Change the primary owner — the number that receives ghost/peek/lurk alerts (primary owner only) |
| `.addowner <number>` | Add secondary owner (primary owner only) |
| `.delowner <number>` | Remove secondary owner (primary owner only) |
| `.owner list` / `.ownerlist` | List all configured bot owners |
| `.mode public\|private` | Set bot access mode |
| `.prefix <char>` | Set command prefix (e.g. `.`, `!`, `#`) |
| `.update` | Trigger git pull & restart |

---

## 🖼️ Getpp — Profile Pictures

| Command | Description |
|---|---|
| `.getpp` | Get profile picture of current chat |
| `.getpp owner` | Send profile picture to owner DM |
| `.getpp chat` | Send profile picture to current chat |
| `.getpp <number>` | Get profile picture of user by phone number |
| `.getpp` (reply) | Get profile picture of replied user |

---

## 📌 Getjid — JID Resolver

| Command | Description |
|---|---|
| `.getjid` | Current chat JID |
| `.getjid` (reply) | Resolve PN + LID of replied message sender |
| `.getjid <number>` | Resolve phone number → PN + LID |
| `.getjid @username` | Resolve username → PN + LID |
| `.getjid <LID>` | Resolve LID → PN |
| `.getjid members` | List all group members with PN, LID, and admin status |
| `.getjid currentchat` | Detailed info for current chat (group, DM, channel) |
| `.getjid channels` | List joined WhatsApp channels |

---

## ⚙️ Presence Controls

| Command | Description |
|---|---|
| `.presence` | Show presence settings |
| `.presence online on\|off` | Toggle always online heartbeat |
| `.presence typing on\|off` | Toggle auto-typing indicator on inbound |
| `.presence recording on\|off` | Toggle auto-recording indicator on inbound |
| `.presence reads on\|off` | Toggle read receipts |

---

## 🛠️ Utility Tools & Manual

| Command | Description |
|---|---|
| `.usermanual` | Generate and receive PDF user manual document (`Al-Jin_Manual.pdf`) |
| `.weather <city>` | Fetch weather forecast and storm alerts |
| `.currency <amount> <from> <to>` | Real-time currency conversion |
| `.define <word>` | Dictionary definition lookup |
| `.pwned <password>` | Check if password has been leaked in breaches |
| `.qr <text>` | Generate QR code image |
| `.readqr` (reply image) | Read and decode QR code from image |
| `.url` (reply media) | Upload media to temp URL host |
| `.shorten <url>` | Shorten long URL using TinyURL / is.gd (`.tinyurl` / `.shorturl`) |
| `.news [topic]` | Top news headlines by topic or global top news |
| `.hackernews` | Top technology stories & discussions from Hacker News (`.hn`) |
| `.wiki <query>` | Search Wikipedia summaries and articles (`.wikipedia`) |
| `.joke` | Fetch a random clean joke |
| `.advice` | Fetch a random piece of life advice |
| `.fact` | Fetch a random trivia fact |
| `.reqlocation` | Request user location with interactive share location button |
| `.owner` | Show owner info |
| `.script` / `.repo` | View bot repository info |

---

## 📊 Activity & Ping

| Command | Description |
|---|---|
| `.activity` | Show chat activity dashboard (messages, media, top senders) |
| `.ping` | Measure RTT latency, memory usage, and uptime |
| `.alive` | Check if Al-Jin is alive (`𝐀𝐥-𝐉𝐢𝐧 𝗜𝗦 𝗔𝗟𝗜𝗩𝗘 ✅`) |
| `.uptime` | Check current bot uptime |
| `.restart` | Restart Al-Jin server process (owner only) |
| `.help` / `.menu` | Render command help menu |

## 🎨 Themes, Wallpapers & Chat Bubbles

| Command | Description |
|---|---|
| `.theme1` ... `.theme10` | Set chat theme preset (1-10) |
| `.reset theme` / `.resettheme` | Reset chat theme to default |
| `.wp1` ... `.wp10` | Set/preview chat wallpaper preset (1-10) |
| `.wp` (reply image) | Set replied photo as custom chat wallpaper |
| `.dp` (reply image) | Set replied photo as profile photo (DP) |
| `.reset wp` / `.resetwp` | Reset chat wallpaper to default |
| `.chatbubble1` ... `.chatbubble10` | Set chat bubble color style preset (1-10) |
| `.reset bubble` / `.resetbubble` | Reset chat bubble style to default |

---

## 🛡️ Guard+ — mutes, forwards, DND & action ladder (admins)

| Command | Description |
|---|---|
| `.muteuser @user [30m\|2h\|1d\|1w]` | Delete everything a member sends for a set time (or until unmuted). Admins/owners can't be muted |
| `.unmuteuser @user` | Let a muted member talk again |
| `.mutelist` | Muted members, time left, banned-sticker count |
| `.mutesticker` (reply to sticker) | Ban that exact sticker in this group (`list`, `clear`) |
| `.unmutesticker` (reply to sticker) | Allow it again |
| `.antiforward on\|off` | Remove forwarded messages from non-admins (aliases `.antifw`, `.afw`) |
| `.dnd on\|off\|<message>` | Delete non-admin messages that tag the bot and reply with your message |

**Action ladder** — `.antiword`, `.antitag` and `.antiforward` all accept:
`.<cmd> action delete\|warn\|kick\|tkick [30m]` and `.<cmd> limit <1-10>`

- `delete` — just delete the message
- `warn` — strikes (default 3), then kick
- `kick` — kick immediately
- `tkick` — kick now, re-add automatically after the duration (default 1h)

The bot must be a group admin to delete messages and remove members.

## 🎛️ Voice effects (reply to a voice note, audio or video)

`.fx` lists them: `.echo` `.reverb` `.nightcore` `.chipmunk` `.slowed` `.deep` `.drunk` `.fast` `.tremolo` `.distort`

---

## 🤖 Free AI chat

| Command | Description |
|---|---|
| `.jin <question>` | Free AI chat with automatic fallback between several free providers. `.jin2`, `.jin3` … use the next free models |
| `.jin create <prompt>` | Generate an image (`.jincreate2` uses image model #2) |
| `.bot <question>` (`.chatbot`) | Fast AI chat with a short memory per chat. `.bot reset` forgets the conversation |
| `.gpt` `.claude` `.grok` `.deepseek` `.kimi` `<question>` | Chat through Puter (needs `PUTER_TOKEN`). `.gpt models` lists models; `.gpt use <id>` picks one (owner) |
| `.gemini <prompt>` | Ask Gemini |
| `.scholar <topic>` | Scholarly explanation of a topic |
| `.photo` / `.imagine` / `.imagen <prompt>` | AI image generation |

---

## 🧞 ESM API commands

Downloaders and AI helpers backed by a free API, each with a built-in fallback source. Size caps follow `.dlcap`.

| Command | Description |
|---|---|
| `.jindl <url>` | Download from a link |
| `.jinvideo <url or query>` | Download a video |
| `.jinytsearch <query>` | Search YouTube |
| `.jinimage <prompt>` | Generate an image |
| `.jinai <prompt>` | AI answer |
| `.jinapk <app>` | Download an APK |

---

## 📱 Apps & devices

| Command | Description |
|---|---|
| `.apk <name or package>` | Download the real, unmodified APK (Aptoide, with an F-Droid fallback) |
| `.betaapk <name or package>` | Newest beta / alpha / RC build when the store lists one |
| `.mobileinfo <model>` | Phone specifications from GSMArena, with an AI-compiled card (clearly labelled) as fallback |
| `.laptopinfo <model>` | Laptop specifications, AI-compiled and labelled, with a Notebookcheck link to verify |

---

## 📸 Instagram+ (owner only)

These use a spare Instagram account's session: `.setvar IG_SESSIONID <cookie>`.

| Command | Description |
|---|---|
| `.igzip <user>` | ZIP of a user's first media items |
| `.igstory <user>` | Current stories |
| `.igsearch <name>` | Find accounts by name |
| `.igprofile <user>` | Extended profile card |

---

## 🎙️ Speech, transcripts & subtitles

| Command | Description |
|---|---|
| `.trb` (`.transcribe`) | Reply to a voice note, audio or video → the speech as text |
| `.trt <language>` | Reply to audio/video → transcript plus translation; replying to a text message translates it |
| `.subtitle` (`.st`, `.subs`) | Reply to a video → speech is transcribed and burned in as subtitles. See [SUBTITLES.md](../SUBTITLES.md) |

Speech-to-text tries Groq, Gemini, Deepgram and OpenAI in turn; keys are optional but make it faster.

---

## 🎭 Stickers, images & media tools

| Command | Description |
|---|---|
| `.sticker` / `.s` | Image, video or GIF → sticker (static or animated) |
| `.toimg` / `.tovid` | Sticker → image / video |
| `.take` (`.steal`) | Re-pack a sticker with your pack name and author |
| `.stickercrop` (`.scrop`) / `.circle` | Square-crop or circle-crop a sticker |
| `.attp <text>` | Animated text sticker |
| `.fancy <text>` | Fancy Unicode text styles |
| `.meme "top" \| "bottom"` | Meme from an image |
| `.blur` / `.greyscale` / `.pixelate` | Image filters |
| `.hd` / `.enhance` | Upscale and enhance an image |
| `.sanitize` / `.exifwipe` | Remove metadata from media |
| `.pdf` (`.topdf`) | Images → PDF |
| `.speed` / `.pitch` / `.reverse` / `.treble` / `.avm` | Audio and video adjustments |
| `.waveform` / `.8d` / `.bassboost [1-10]` / `.robot` / `.vocal` | Audio effects |
| `.ocr` / `.tts [lang] <text>` / `.barcode` / `.vcard @user` | Read text from images, text-to-speech, barcodes, contact cards |
| `.dice [spec]` / `.coin [count]` | Dice and coin flips |

---

## 🛡️ Group protection & tools

Admin commands need the bot to be a group admin to delete or remove. Admins and bot owners are always exempt.

| Command | Description |
|---|---|
| `.antiword` (`.antibadword`) | Block listed words, with a punishment ladder (delete → warn → kick) |
| `.antitag` | Block mass tagging by non-admins |
| `.antigm` | Delete "group mentioned in a status" spam from non-admins |
| `.antifake add 1 212 91` | Block members whose number starts with the listed country codes (`.antifake on\|off`) |
| `.antiforward` / `.dnd` | Block forwarded messages; do-not-disturb mode |
| `.antipromote` / `.antidemote` / `.antibot` / `.gshield` | Protect admin roles and the group from unwanted changes |
| `.muteuser` / `.unmuteuser` / `.mutelist` / `.mutesticker` | Silence users or stickers |
| `.warn @user` / `.warns` / `.resetwarns @user` | Warning system |
| `.noaction @user` | Protect a member: demoted → promoted again; kicked → added back. Also `.noaction @user all`, `.noaction off @user`, `.noaction list` |
| `.filter` / `.stop` / `.gfilter` / `.gstop` | Auto-replies for keywords (group / global) |
| `.areact` | Auto-react to messages |
| `.setgname` / `.setgdesc` / `.setgpp` / `.link` | Group name, description, picture, invite link |
| `.admins` / `.msgs` / `.inactive` / `.left` / `.common` | Group statistics and member lists |
| `.poll Question \| Option 1 \| Option 2 [--multi]` | Create a poll |
| `.vote` / `.afk` | Voting and away status |
| `.kickall` / `.kickcc <code>` / `.approveall` / `.declineall` | Bulk member actions |
| `.gclone` / `.revoke` / `.purge [count]` | Clone group settings, reset the invite link, delete recent messages |
| `.tagallnoadmin` / `.hidetagnoadmin` | Tag everyone except admins |
| `.leave` / `.join <link>` | Leave a group or join with an invite link |

---

## 🕵️ Monitoring

| Command | Description |
|---|---|
| `.stalk <number>` / `.stalk list` / `.stalk stop <number>` | Log when a contact goes online or offline, and for how long |
| `.statusalert <number>` | Alert when a chosen person posts a status |
| `.watch <number>` | Alert when a person changes profile picture, About or name |
| `.ginfo <invite link>` | Inspect a group without joining |
| `.chatstats <number>` | Detailed chat statistics |

---

## 🎮 Games & fun

| Command | Description |
|---|---|
| `.tictactoe` (`.ttt`) / `.hangman` / `.guess` / `.rps` | Games |
| `.8ball` / `.ship` / `.rate` / `.truth` / `.dare` / `.compliment` / `.insult` / `.flirt` | Party commands |
| `.hug` / `.kiss` / `.pat` / `.cry` / `.poke` / `.wink` / `.nom` | Reaction GIFs |
| `.trivia` / `.quote` / `.pokedex` / `.anime` / `.character` | Trivia, quotes, Pokémon, anime and character lookups |

---

## 🧰 Offline & web utilities

| Command | Description |
|---|---|
| `.calc` / `.color` / `.base64` / `.hash` / `.morse` | Calculator, colour tools, encoders, hashes |
| `.password` / `.uuid` / `.age` / `.bmi` / `.time` | Password and ID generators, age, BMI, time zones |
| `.budget` / `.task` (`.todo`) | Budget tracker and to-do list |
| `.translate` (`.trt`) / `.crypto` / `.github` / `.whois` | Translation, crypto prices, GitHub and domain lookups |
| `.urban` / `.slang` / `.npm` / `.githubdiff` / `.unit` | Slang, npm, GitHub diffs, unit conversion |
| `.tempmail` / `.readmail` / `.web2img` / `.unroll` / `.channelinfo` / `.commandcount` | Temporary email, website screenshot, link unroller, channel info, usage counts |

---

## 🧰 Owner & bot control

| Command | Description |
|---|---|
| `.ban` / `.unban` / `.banlist` | Block users from the bot |
| `.pmblocker` | Block or warn strangers who message the bot privately |
| `.setcmd` / `.delcmd` / `.cmds` | Custom command aliases |
| `.cpu` / `.ram` / `.rom` / `.cpulimit` / `.ramlimit` | System usage and limits |
| `.dlcap` | Download size and quality limits |
| `.replymode text\|poll\|buttons` | Choose how selection prompts appear |
| `.imenu` | Menu preview image settings |
| `.cleartmp` / `.clearsession` / `.shutdown` | Maintenance: clear temp files, remove stale session files, stop the bot |
| `.save` | Reply to a message, photo, video or status to save it |
| `.del` | Delete a message |
| `.ison <number>` | Check whether numbers are on WhatsApp |
| `.fixkeys [own\|all]` | Fix "Waiting for this message" on the bot's own phone without re-pairing |
| `.privacy` / `.stealfull @user` / `.ytcookies` | Privacy settings, full-size profile picture, YouTube cookies |

---

## 🎨 Text effects (Ephoto360)

`.textmaker <effect> <text>` or a direct effect command such as `.neon`, `.glitch`, `.3dgold`, `.cyberpunk`, `.galaxy`, `.hologram`, `.naruto`, `.pubg`, `.starwars`, `.dragon`, `.xmas` and 40+ more. Two-line effects (`.marvel`, `.pornhub`) take `text1 ; text2`.

---

## 📥 More downloaders

| Command | Description |
|---|---|
| `.download <url>` | Alias of `.dl` |
| `.pinterest` / `.threads` / `.reddit` / `.twitter <url>` | Download from those platforms |
