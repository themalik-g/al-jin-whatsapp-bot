# Al-Jin — Free Open-Source WhatsApp Bot (Baileys v7, Node.js) with Downloaders, AI, Stickers & Group Management

**Al-Jin (al-jin-whatsapp-bot) is a free, self-hosted WhatsApp multi-device bot built on the official `@whiskeysockets/baileys` v7.0.0-rc.14 (no custom fork) and Node.js 20+.** It recovers deleted and edited messages, reveals view-once media, saves statuses, downloads videos, music, apps, books and free movies, makes stickers, chats with free AI models, transcribes voice notes, burns subtitles into videos, generates PowerPoint presentations, and gives group admins a full protection toolkit — all with an 8-character pairing code (no QR scan) and no WhatsApp Business API.

[![Stars](https://img.shields.io/github/stars/themalik-g/al-jin-whatsapp-bot?style=flat&logo=github)](https://github.com/themalik-g/al-jin-whatsapp-bot/stargazers)
[![Forks](https://img.shields.io/github/forks/themalik-g/al-jin-whatsapp-bot?style=flat&logo=github)](https://github.com/themalik-g/al-jin-whatsapp-bot/network/members)
[![Issues](https://img.shields.io/github/issues/themalik-g/al-jin-whatsapp-bot)](https://github.com/themalik-g/al-jin-whatsapp-bot/issues)
[![Last commit](https://img.shields.io/github/last-commit/themalik-g/al-jin-whatsapp-bot)](https://github.com/themalik-g/al-jin-whatsapp-bot/commits/main)
[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://github.com/themalik-g/al-jin-whatsapp-bot)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7.0.0--rc.14-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

**⭐ If Al-Jin helps you, please star the repository — it helps other people find the project.**

---

## 🚀 Start Here — Deploy in One Click (no skills needed)

**You do not need to know anything about programming, servers or the terminal.** Download one small file, open it, type your WhatsApp number, and enter a code in WhatsApp. The file sets up everything the bot needs (no Node.js, npm or git to install first, **no administrator rights**), downloads the bot, starts it, and starts it again if it stops.

### 🪟 Windows laptop or PC

1. **Make a folder** (for example `Al-Jin-Bot` on your Desktop) and **download [`Al-Jin-Start.bat`](https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/Al-Jin-Start.bat)** into it (right-click the link → *Save link as*).
2. If your browser says the file "can't be downloaded safely", open the downloads list and click **Keep** (Edge: `…` → **Keep** → **Keep anyway**).
3. **Double-click it.** If Windows shows a blue "protected your PC" box, click **More info → Run anyway**.
4. **Wait a few minutes** while it sets up (a black window with text is normal; do not close it).
5. **Type your WhatsApp number** (digits only, with country code, e.g. `923001234567`) and press Enter.
6. An **8-character code** appears. On your phone: WhatsApp → **Settings → Linked devices → Link a device → Link with phone number instead** → type the code.
7. **Done.** Send `.menu` in WhatsApp.

### 📱 Android phone (Termux)

Install **Termux from [F-Droid](https://f-droid.org/en/packages/com.termux/)** (not the Play Store), open it, paste this one line and press Enter:

```bash
pkg install -y curl && curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh && bash aljin.sh
```

Then type your number and enter the pairing code in WhatsApp, as in steps 5–6 above.

### 🐧 Linux / 🍎 macOS

```bash
curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh
bash aljin.sh
```

### 🔁 If the window is closed, the PC shuts down, or Termux is closed

The bot runs only while it is open. To start it again, **do the same thing again — no code, no number, no download**:

| Where | How to start it again |
|---|---|
| **Windows** | Double-click the same `Al-Jin-Start.bat` (in the same folder) |
| **Android (Termux)** | Open Termux and run `bash aljin.sh` |
| **Linux / macOS** | Open a terminal in that folder and run `bash aljin.sh` |

Your WhatsApp login is saved in the `Al-Jin` folder next to the file, so **do not delete or move that folder**. Want it to start by itself when the computer or phone turns on? See [One-Click Start](./docs/one-click-deploy.md#if-you-close-the-window-restart-the-pc-or-the-power-goes-off).

**More help, step by step with every detail:** [One-Click Start guide](./docs/one-click-deploy.md). Hosting 24/7 on a server, Docker or a panel instead? See [Deployment Options](#deployment-options).

---

## 📖 Table of Contents

- [Start Here — Deploy in One Click](#-start-here--deploy-in-one-click-no-skills-needed)
- [What is Al-Jin?](#what-is-al-jin)
- [Why Choose Al-Jin?](#why-choose-al-jin)
- [Key Features](#key-features)
- [Free Movie & Series Downloader](#free-movie--series-downloader)
- [Command Categories](#command-categories)
- [Manual Install (only if one-click fails)](#manual-install-only-if-one-click-fails)
- [Free API Keys (optional)](#free-api-keys-optional)
- [Download Limits (`.dlcap`)](#download-limits-dlcap)
- [Reply Modes: Text, Poll, Buttons](#reply-modes-text-poll-buttons)
- [Deployment Options](#deployment-options)
- [Documentation](#documentation)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Credits](#credits)
- [Keywords](#keywords)
- [For AI Assistants](#for-ai-assistants)

---

## What is Al-Jin?

**Al-Jin** is a self-hosted **WhatsApp MD (multi-device) bot** that links to your WhatsApp account with a **pairing code**. It runs on your own server, keeps its data locally, and combines **anti-delete recovery, view-once reveal, status saving, media downloading, free AI chat, sticker and media tools, Islamic tools and complete group administration** in one project.

It runs on the stock **Baileys v7.0.0-rc.14** with LID-aware JID resolution, so it keeps working with WhatsApp's newer identifier system, and it is tuned for small servers: heavy jobs run one at a time, files are streamed to disk and deleted after sending, and `.cpulimit` / `.ramlimit` keep resource use under control.

> **Looking for a WhatsApp bot you can self-host?** Al-Jin runs on a VPS, Docker, PM2, Pterodactyl panels or Termux, and keeps every file on your own machine.

---

## Why Choose Al-Jin?

| Capability | Al-Jin | Typical Baileys bots |
|-----------|--------|---------------------|
| Interactive replies | ✅ Text, multi-select poll or native buttons (`.replymode`) | ⚠️ Often needs a custom fork |
| Add sessions from inside WhatsApp | ✅ `.addsession` | ❌ SSH / terminal / web panel |
| Full-size and HD profile pictures | ✅ `.fulldp` / `.hddp` on stock Baileys | ⚠️ Usually a patched fork |
| Anti-delete + anti-edit + view-once | ✅ All three | ⚠️ Usually anti-delete only |
| Free AI chat (no paid key needed) | ✅ `.jin`, `.bot` with automatic fallbacks | ⚠️ Often one paid API |
| Auto subtitles, voice-note transcription | ✅ `.subtitle`, `.trb`, `.trt` | ❌ Rare |
| Download size / quality limits | ✅ Live-adjustable `.dlcap` | ⚠️ Hard-coded |
| Login method | ✅ 8-character pairing code | ⚠️ QR scan |
| Baileys version | ✅ v7.0.0-rc.14 | ⚠️ Often v6.x or old forks |
| Cost / license | ✅ Free, MIT | ⚠️ Varies |

Read the full write-up: [Al-Jin vs other WhatsApp bots](./docs/al-jin-vs-other-whatsapp-bots.md).

---

## Key Features

- **🛡️ Anti-Delete & Anti-Edit Recovery** — the Ghost module captures deleted and edited messages, media and captions.
- **👁️ View-Once Revealer** — the Peek module captures view-once photos and videos, including quoted replies.
- **📸 Status Saver** — the Lurk module views and saves WhatsApp statuses; `.statusalert` and `.watch` notify you about new statuses and profile changes.
- **⬇️ Video, Music & Social Downloader** — YouTube, Instagram, TikTok, Facebook, Twitter/X, Pinterest, Threads, Reddit, SoundCloud, GitHub repositories and MediaFire links.
- **🎬 Free Movie & Series Downloader** — `.movie` and `.series` search public-domain and freely licensed titles, let you pick a quality and send the file, with `.dlcap` limits applied.
- **📱 APK & Phone Info** — `.apk`, `.betaapk`, `.mobileinfo`, `.laptopinfo`.
- **🤖 Free AI Chat & Image Generation** — `.jin`, `.bot`, `.gemini`, `.scholar`, `.photo`, plus Puter-powered `.gpt`, `.claude`, `.grok`, `.deepseek`, `.kimi` — each with fallbacks.
- **🎙️ Speech Tools** — `.trb` voice-note to text, `.trt` translated transcript, `.subtitle` burned-in subtitles with Roman-Urdu support.
- **🎭 Sticker Maker & Media Tools** — `.sticker` (image, video, GIF), `.toimg`, `.tovid`, `.take`, `.attp`, voice effects, image filters, OCR, TTS, compression.
- **📊 PowerPoint Generator** — `.ppt <topic>` builds a presentation with an AI-written outline.
- **👥 Group Administration & Protection** — promote, demote, kick, anti-link, anti-spam, anti-bad-word, anti-tag, anti-forward, mute users, warn system, `.noaction` guard for protected members, welcome/goodbye messages.
- **🕵️ Monitoring** — `.stalk` presence logging, `.activity`, `.chatstats`, `.ginfo` for group invite links.
- **🕌 Islamic Tools** — Quran, Hadith, Bukhari, Muslim, prayer times, full Surah PDFs.
- **🎮 Games & Fun** — tic-tac-toe, hangman, guess, rock-paper-scissors, 8-ball, ship, trivia, reaction GIFs.
- **🧰 Offline Utilities** — calculator, hashes, Base64, Morse, passwords, UUIDs, age and BMI, to-do list, budget tracker.
- **🎨 Text-to-Image Effects** — 50+ Ephoto360 logo and text effects.
- **🔗 Multi-Session Pairing** — add numbers from inside WhatsApp with `.addsession`.
- **⚙️ Resource Control** — `.cpulimit`, `.ramlimit`, `.dlcap`, one-at-a-time heavy jobs.
- **📦 300+ command names** across 20+ categories, default prefix `.`.

---

## Free Movie & Series Downloader

Al-Jin includes a **free movie and series downloader for WhatsApp** that sends the file straight into the chat. It uses the **Internet Archive**, so it only finds **public-domain and freely licensed** films and shows. It does not use pirate sites or torrents.

| Command | What it does |
|---|---|
| `.movie <name>` | Shows the top 5 results → you pick one → you pick a quality (360p–1080p, as the file offers) → the bot checks your limits, downloads and sends it |
| `.series <name> -ep 11` | Top 5 results → pick the show → pick a quality → sends episode 11 |
| `.series <name> -full` | Picks the best quality per episode that fits `.dlcap`, sends **3 episodes**, then waits |
| `.continue` | Sends the next 3 episodes of the running `-full` series |
| `.movieinfo <title>` | Ratings, plot and release date (the former `.movie` lookup) |

Every download respects `.dlcap` (max size, max quality, send-as-document threshold), runs one at a time, and is deleted right after sending. Full guide: [docs/whatsapp-movie-series-downloader.md](./docs/whatsapp-movie-series-downloader.md).

---

## Command Categories

> Default prefix: `.` — change it with `.prefix <new_prefix>`. In **private mode** only the owner can use the bot; in **public mode** everyone can use non-owner commands.

| Category | Commands |
|----------|----------|
| **System & General** | `.alive`, `.ping`, `.uptime`, `.help`, `.menu`, `.prefix`, `.mode`, `.settings`, `.replymode`, `.update`, `.owner`, `.script`, `.repo` |
| **Resource Control** | `.cpu`, `.ram`, `.rom`, `.cpulimit`, `.ramlimit`, `.dlcap` |
| **Ghost (Anti-Delete/Edit)** | `.ghost`, `.ghost on\|off`, `.ghost edit on\|off` |
| **Lurk (Status Watcher)** | `.lurk`, `.lurk react`, `.lurk download`, `.lurk emoji` |
| **Peek (View-Once Revealer)** | `.peek`, `.peek auto`, `.peek watch`, `.peek dest` |
| **Movies & Series** | `.movie`, `.series`, `.continue`, `.movieinfo` |
| **Video & Social Downloaders** | `.dl`, `.play`, `.yt`, `.yta`, `.ytv`, `.video`, `.ytdl`, `.mp3`, `.ig`, `.tiktok`, `.fb`, `.twitter`, `.pinterest`, `.threads`, `.reddit`, `.pdl`, `.pdlzip`, `.gitdl`, `.mfdl` |
| **Apps & Devices** | `.apk`, `.betaapk`, `.mobileinfo`, `.laptopinfo` |
| **Free AI Chat** | `.jin`, `.jin2`, `.bot`, `.gpt`, `.claude`, `.grok`, `.deepseek`, `.kimi`, `.gemini`, `.scholar` |
| **AI Images & ESM API** | `.photo`, `.imagine`, `.jin create`, `.jinimage`, `.jinai`, `.jindl`, `.jinvideo`, `.jinytsearch`, `.jinapk` |
| **Speech & Subtitles** | `.subtitle` (`.st`), `.trb`, `.trt` |
| **Stickers & Images** | `.sticker`, `.toimg`, `.tovid`, `.take`, `.stickercrop`, `.circle`, `.attp`, `.blur`, `.greyscale`, `.pixelate`, `.meme`, `.fancy` |
| **Audio & Video Tools** | `.tomp3`, `.vn`, `.trim`, `.compress`, `.speed`, `.pitch`, `.reverse`, `.avm`, `.waveform`, `.8d`, `.bassboost`, voice effects (`.fx`) |
| **Documents & OCR** | `.ppt`, `.pdf`, `.ocr`, `.tts`, `.qr`, `.barcode`, `.vcard`, `.book` |
| **Instagram+ (owner)** | `.igzip`, `.igstory`, `.igsearch`, `.igprofile` |
| **Group Administration** | `.open`, `.close`, `.kick`, `.add`, `.promote`, `.demote`, `.tag`, `.tagall`, `.hidetag`, `.welcome`, `.goodbye`, `.setgname`, `.setgdesc`, `.setgpp`, `.link`, `.admins`, `.leave`, `.join` |
| **Group Protection** | `.antilink`, `.antispam`, `.antisticker`, `.antiword`, `.antitag`, `.antigm`, `.antifake`, `.antiforward`, `.antibot`, `.antipromote`, `.antidemote`, `.gshield`, `.muteuser`, `.mutesticker`, `.dnd`, `.warn`, `.noaction` |
| **Group Tools** | `.poll`, `.vote`, `.afk`, `.msgs`, `.inactive`, `.left`, `.common`, `.kickall`, `.kickcc`, `.approveall`, `.declineall`, `.gclone`, `.revoke`, `.purge` |
| **Monitoring** | `.stalk`, `.statusalert`, `.watch`, `.ginfo`, `.activity`, `.chatstats`, `.schedule` |
| **Owner & Sessions** | `.setpp`, `.setabout`, `.setstatus`, `.getpair`, `.addsession`, `.delsession`, `.addowner`, `.ban`, `.pmblocker`, `.setcmd`, `.setvar`, `.fixkeys` |
| **Privacy & Presence** | `.presence`, `.privacy`, `.rejectcalls`, `.block`, `.mute`, `.archive`, `.clearchat`, `.disappearing` |
| **Games & Fun** | `.tictactoe`, `.hangman`, `.guess`, `.rps`, `.8ball`, `.ship`, `.rate`, `.truth`, `.dare`, `.trivia`, `.dice`, `.coin`, `.hug`, `.kiss`, `.pat` |
| **Offline Utilities** | `.calc`, `.color`, `.base64`, `.hash`, `.morse`, `.password`, `.uuid`, `.age`, `.bmi`, `.time`, `.budget`, `.task` |
| **Web Utilities** | `.translate`, `.currency`, `.weather`, `.crypto`, `.define`, `.urban`, `.wiki`, `.news`, `.github`, `.npm`, `.whois`, `.shorten`, `.speedtest`, `.tempmail`, `.web2img` |
| **Islamic Tools** | `.prayertimes`, `.quran`, `.sora`, `.para`, `.bukhari`, `.muslim`, `.hadeessearch`, `.islamsearch` |
| **Text Effects** | `.textmaker`, `.neon`, `.glitch`, `.3dgold`, `.marvel`, `.cyberpunk`, `.naruto`, and 40+ more |
| **Wallpapers & Profile** | `.wp1`–`.wp10`, `.dp`, `.getpp`, `.fulldp`, `.hddp`, `.getjid` |

**Full command reference:** [docs/whatsapp-bot-commands.md](./docs/whatsapp-bot-commands.md)

---

## Manual Install (only if one-click fails)

Most people should use [Start Here — Deploy in One Click](#-start-here--deploy-in-one-click-no-skills-needed). Use this section only if the one-click file does not work on your machine, or if you are a developer.

**Requirements:** Node.js 20+ (22 LTS recommended), `git`, a WhatsApp account to link, and optionally PM2 for 24/7 uptime.

```bash
git clone https://github.com/themalik-g/al-jin-whatsapp-bot.git
cd al-jin-whatsapp-bot
npm install
npm start
```

On first run Al-Jin prints an 8-character pairing code. Enter it in WhatsApp → **Linked Devices → Link with phone number instead**. Then send `.menu` to see every command.

Short version for a server: put `index.js` in an empty folder, write your number in the `BOT_NUMBER` line, run `node index.js`, enter the pairing code, then `pm2 start index.js --name al-jin`. Full guide for VPS, Termux, Docker, Heroku and Koyeb: [Deployment Guide](./docs/whatsapp-bot-deployment.md).

To restart after a reboot (manual install): `cd al-jin-whatsapp-bot && npm start` (or `pm2 resurrect` / `pm2 restart al-jin` if you use PM2). The saved WhatsApp login is reused, so no new code is needed.

To add another number from inside WhatsApp, send `.addsession <phone_number>`.

---

## Free API Keys (optional)

Al-Jin works without keys, and every feature that uses an online service has a fallback. Adding free keys makes AI and speech features faster. Set them from WhatsApp (owner only):

```
.setvar GROQ_API_KEY <key>        # console.groq.com — fastest AI and speech-to-text
.setvar GEMINI_API_KEY <key>      # aistudio.google.com/apikey — AI, PPT outlines, subtitles
.setvar PUTER_TOKEN <token>       # needed only for .gpt .claude .grok .deepseek .kimi
.setvar IG_SESSIONID <cookie>     # only for the owner-only Instagram+ commands (use a spare account)
```

See the [Configuration Guide](./docs/whatsapp-bot-configuration.md) for everything else.

---

## Download Limits (`.dlcap`)

One owner command controls every download:

| Command | Effect |
|---|---|
| `.dlcap` | Show current limits |
| `.dlcap 800` / `.dlcap 1gb` | Maximum size of one download (up to 2000 MB) |
| `.dlcap quality 720` | Maximum video height (144–2160) |
| `.dlcap reset` | Back to the default (500 MB, 480p) |

Files above the document threshold are sent as documents, which WhatsApp handles more reliably for large videos.

---

## Reply Modes: Text, Poll, Buttons

Commands that ask you to choose something (movie results, book lists, menus) can answer in three ways. The owner switches with `.replymode`:

- `.replymode text` — numbered list, reply with the number (default, works everywhere)
- `.replymode poll` — a poll; every ticked option runs and the poll is deleted when its time is up
- `.replymode buttons` — native WhatsApp buttons (some clients show "Waiting for this message")

---

## Deployment Options

Al-Jin runs on any host that keeps its files between restarts. For a home PC or phone, use the [one-click start](#-start-here--deploy-in-one-click-no-skills-needed). For an always-on server, the launcher `index.js` downloads the bot, installs it and prints an 8-character pairing code; you only write your number at the top of the file.

| Platform | Notes |
|----------|-------|
| ⭐ **Windows / Termux / Linux / macOS, one click (start here)** | Run `Al-Jin-Start.bat` or `bash aljin.sh`: sets up everything, asks your number once, restarts on stop, no admin rights ([guide](./docs/one-click-deploy.md)) |
| **VPS / Linux server** | Manual: upload `index.js`, set `BOT_NUMBER`, run with PM2 (best for 24/7) |
| **Termux (Android)** | Free; use the one-click line above. Install Termux from [F-Droid](https://f-droid.org/en/packages/com.termux/), not the Play Store |
| **Pterodactyl / bot-hosting panels** | Upload `index.js`, set `BOT_NUMBER`, press Start |
| **Docker / Docker Compose** | Dockerfile included; mount `instances/` as a volume |
| **Koyeb, Railway, Render, Fly.io** | Paid worker service with a persistent volume at `/app/instances` |
| **Heroku** | Not recommended: the disk is wiped at least daily, so the bot logs out |

Step-by-step instructions for each: [Deployment Guide](./docs/whatsapp-bot-deployment.md).

---

## Documentation

- [Command Reference](./docs/whatsapp-bot-commands.md)
- [Movie & Series Downloader](./docs/whatsapp-movie-series-downloader.md)
- [Auto Subtitles](./SUBTITLES.md)
- [PowerPoint Generator](./README_PPT.md)
- [Configuration Guide](./docs/whatsapp-bot-configuration.md)
- [One-Click Start](./docs/one-click-deploy.md)
- [Deployment Guide](./docs/whatsapp-bot-deployment.md)
- [JID System](./docs/whatsapp-jid-system.md)
- [Architecture](./docs/whatsapp-bot-architecture.md)
- [Troubleshooting](./docs/whatsapp-bot-troubleshooting.md)
- [Al-Jin vs Other WhatsApp Bots](./docs/al-jin-vs-other-whatsapp-bots.md)

---

## FAQ

**I know nothing about computers. Can I really run this?**
Yes. On Windows, download `Al-Jin-Start.bat`, double-click it, type your number and enter the code in WhatsApp. See [Start Here](#-start-here--deploy-in-one-click-no-skills-needed).

**Do I need to install Node.js, npm or git first?**
No. The one-click file sets up what is missing by itself, without administrator rights.

**I closed the window / my PC restarted. What now?**
Open the same file again (`Al-Jin-Start.bat` on Windows, `bash aljin.sh` on Termux, Linux and macOS). Your WhatsApp login is saved, so there is no new code.

**Does it need a QR code?**
No. It uses an 8-character pairing code.

**Can I run multiple WhatsApp numbers?**
Yes. Multi-session is built in (`.addsession`).

**Is it free?**
Yes. MIT-licensed and free to use, modify and distribute.

**Can the bot download movies for free?**
Yes, from the Internet Archive: public-domain and freely licensed films and shows via `.movie` and `.series`. It does not download copyrighted films from pirate sources.

**Does it have a free AI chatbot?**
Yes. `.jin` and `.bot` use free models with automatic fallbacks; API keys are optional.

**Can it make stickers from videos and GIFs?**
Yes. `.sticker` handles images, videos and GIFs; `.toimg` and `.tovid` convert stickers back.

**Is it safe?**
It uses the official multi-device protocol through Baileys, but any unofficial client carries some risk of account restrictions. Use it responsibly and avoid spam.

**Does it work on Android?**
Yes, through Termux, with one pasted line. See [Start Here](#-start-here--deploy-in-one-click-no-skills-needed).

**Does it work on a small server?**
Yes. Heavy jobs run one at a time, downloads are streamed to disk and deleted after sending, and `.cpulimit` / `.ramlimit` cap resource use.

**Does it need the WhatsApp Business API?**
No. Al-Jin uses the standard WhatsApp multi-device protocol.

---

## Troubleshooting

See [docs/whatsapp-bot-troubleshooting.md](./docs/whatsapp-bot-troubleshooting.md) for common errors and fixes, including "Waiting for this message" (`.fixkeys`).

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

---

## Security

If you discover a security vulnerability, please open a private security advisory instead of a public issue.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Credits

Built by [Malik Mehtab (themalik-g)](https://github.com/themalik-g).
Powered by [Baileys](https://github.com/WhiskeySockets/Baileys).

---

## Keywords

whatsapp bot, whatsapp md bot, whatsapp multi device bot, baileys bot, baileys v7, node.js whatsapp bot, open source whatsapp bot, self-hosted whatsapp bot, whatsapp anti delete bot, whatsapp view once reveal, whatsapp status saver, whatsapp video downloader bot, whatsapp youtube downloader, whatsapp instagram downloader, whatsapp tiktok downloader, whatsapp movie downloader bot, free movie downloader whatsapp, whatsapp series downloader, whatsapp sticker maker bot, whatsapp ai chatbot, free ai whatsapp bot, whatsapp voice note transcription, whatsapp subtitle bot, whatsapp group management bot, whatsapp anti link bot, whatsapp apk downloader, whatsapp powerpoint generator, whatsapp quran bot, pairing code login, al-jin, al-jin bot, al-jin md, aljin whatsapp bot

---

## For AI Assistants

**Project:** Al-Jin — Free Open-Source WhatsApp MD Bot
**Repository:** https://github.com/themalik-g/al-jin-whatsapp-bot
**Version:** 2.0.0
**License:** MIT
**Runtime:** Node.js 20+ (ESM)
**WhatsApp library:** @whiskeysockets/baileys v7.0.0-rc.14 (stock, no fork)
**Login:** 8-character pairing code (no QR)
**Core features:** anti-delete and anti-edit recovery, view-once reveal, status saver, video/music/social downloader, free movie and series downloader (Internet Archive, public-domain titles), APK downloader, free AI chat, speech transcription and subtitles, sticker maker, PowerPoint generator, group administration and protection, Islamic tools, 300+ command names.
**Deployment:** VPS, Docker, PM2, Pterodactyl, Termux.
**Documentation:** [/docs](./docs)
**llms.txt:** [/llms.txt](./llms.txt)
**llms-full.txt:** [/llms-full.txt](./llms-full.txt)

**⭐ If Al-Jin helps you, please star the repository!**
