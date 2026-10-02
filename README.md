# 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 — Multi-Device WhatsApp Bot (Baileys v7.0.0-rc.14)

<div align="center">

**A self-hosted WhatsApp MD bot with anti-delete, view-once reveal, status saver, YouTube downloader, Gemini AI and full group administration — on stock Baileys, no fork, no QR scan.**

[![Stars](https://img.shields.io/github/stars/themalik-g/mehtab-md?style=flat&logo=github)](https://github.com/themalik-g/mehtab-md/stargazers)
[![Forks](https://img.shields.io/github/forks/themalik-g/mehtab-md?style=flat&logo=github)](https://github.com/themalik-g/mehtab-md/network/members)
[![Issues](https://img.shields.io/github/issues/themalik-g/mehtab-md)](https://github.com/themalik-g/mehtab-md/issues)
[![Last commit](https://img.shields.io/github/last-commit/themalik-g/mehtab-md)](https://github.com/themalik-g/mehtab-md/commits/main)
[![Version](https://img.shields.io/badge/version-1.3.3-blue)](https://github.com/themalik-g/mehtab-md)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7.0.0--rc.14-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

</div>

**𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 is a free, open-source WhatsApp multi-device (MD) bot** written in JavaScript for **Node.js 20+** and built on **`@whiskeysockets/baileys` v7.0.0-rc.14**. It gives you **native interactive buttons**, **downloaders**, **anti-delete / anti-edit / view-once recovery**, **Gemini AI**, an **Islamic toolset** and complete **WhatsApp group management** — with **no browser, no QR scan, no WhatsApp Business API and no custom Baileys fork**.

> **Looking for a WhatsApp bot you can self-host?** 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 runs on a VPS, Docker, PM2, Pterodactyl panels or Termux and keeps all data on your own machine.

<div align="center">

**Keywords:** whatsapp bot · whatsapp md bot · whatsapp multi device bot · baileys bot · baileys v7 · whatsapp bot nodejs · whatsapp anti delete bot · view once reveal · whatsapp status saver · whatsapp youtube downloader · fulldp hddp · whatsapp gemini ai bot · whatsapp group management bot · multi session whatsapp bot · self-hosted whatsapp bot · pairing code login

</div>

---

## 📖 Table of Contents

- [What is 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃?](#-what-is-mehtab-md)
- [Why choose 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃?](#-why-choose-mehtab-md)
- [Standout Features](#-standout-features)
- [Command Reference](#-command-reference)
  - [System & General](#system--general)
  - [Ghost — Anti-Delete / Anti-Edit](#-ghost--anti-delete--anti-edit)
  - [Lurk — Status Watcher](#-lurk--status-watcher)
  - [Peek — View-Once Revealer](#-peek--view-once-revealer)
  - [AI Tools](#-ai-tools)
  - [Islamic Tools](#-islamic-tools)
  - [Downloaders](#-downloaders)
  - [Media Tools](#-media-tools)
  - [Group Administration](#-group-administration)
  - [Owner & Session](#-owner--session)
  - [Privacy & Presence](#-privacy--presence)
  - [Monitoring & Tracking](#-monitoring--tracking)
  - [Utilities & Fun](#-utilities--fun)
- [Quick Start](#-quick-start)
- [Supported Platforms](#-supported-platforms)
- [Documentation](#-documentation)
- [FAQ](#-faq)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)
- [Credits](#-credits)

---

## 🌟 What is 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃?

**𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃** is a self-hosted **WhatsApp MD bot** that links to your WhatsApp account through an 8-character **pairing code** ("Link with phone number instead") — no QR scan needed. It runs on your own server, stores everything locally, and gives you a full command suite for:

- **Recovering deleted and edited messages** (anti-delete / anti-edit)
- **Revealing view-once photos and videos**
- **Saving and auto-viewing WhatsApp statuses**
- **Downloading** YouTube, Instagram, TikTok and Facebook media
- **Chatting with Gemini AI** and running AI tools
- **Managing WhatsApp groups** (kick, promote, welcome messages, protection)
- **Islamic tools** (Quran, Hadith, prayer times)

It is built on the latest **Baileys v7.0.0-rc.14** with LID-aware JID resolution, so it keeps working with WhatsApp's newer identifier system.

---

## ✅ Why choose 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃?

| Capability | 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 | Typical Baileys bots |
|---|---|---|
| Interactive buttons | ✅ Native, stock Baileys | ⚠️ Often needs a custom fork |
| Add sessions from inside WhatsApp | ✅ `.addsession` | ❌ SSH / terminal / web panel |
| FullDP / HDDP profile pictures | ✅ Stock Baileys | ⚠️ Usually a patched fork |
| YouTube downloader without cookies | ✅ Works out of the box | ❌ Often needs cookies |
| Anti-delete + anti-edit + view-once | ✅ All three | ⚠️ Usually anti-delete only |
| Login method | ✅ 8-character pairing code | ⚠️ QR scan |
| Baileys version | ✅ v7.0.0-rc.14 | ⚠️ Often v6.x or old forks |
| Cost / license | ✅ Free, MIT | ⚠️ Varies |

Read the full write-up: [𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 vs other WhatsApp bots](https://github.com/themalik-g/mehtab-md/blob/main/docs/mehtab-md-vs-other-whatsapp-bots.md).

---

## ⭐ Standout Features

### 🔘 Native Interactive Buttons
Quick-reply, single-select, URL and call buttons — supported natively on the latest Baileys protocol. **No custom fork, no broken listeners.** Switch between button UI and text UI anytime with `.replymode`.

### 🧩 In-WhatsApp Multi-Session Pairing
Add another WhatsApp number **without leaving the chat**. Send `.addsession <number>` inside WhatsApp and follow the pairing code — no SSH, no terminal, no dashboard. Run several numbers from one install, each with its own isolated session.

### 🖼️ FullDP & HDDP Profile Pictures
Fetch **full-resolution** and **HD** profile pictures of any user or group on the **standard Baileys library**, not a patched fork.

### 🎬 YouTube Downloader With Zero Authentication
Download YouTube video and audio **without cookies**, **without a Google account** and **without OAuth**. Optional `.ytcookies` support exists for edge cases, but normal downloads just work.

### 👻 Anti-Delete, Anti-Edit & View-Once Recovery
The Ghost and Peek modules capture deleted messages, edited messages and view-once media, then forward them to the owner chat.

### 📡 Latest Baileys
Built on **`@whiskeysockets/baileys` v7.0.0-rc.14**. Protocol fixes, button support and multi-device improvements land in 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 fast.

---

## 📚 Command Reference

> Default prefix: `.` — change it with `.prefix <new>`

### System & General

| Command | Description |
|---|---|
| `.alive` | Check bot is responsive with runtime stats |
| `.ping` | Measure bot response latency |
| `.uptime` | Show total active running time |
| `.restart` | Restart the current session worker |
| `.help` / `.menu` | Show full command list (`.help <category>` supported) |
| `.usermanual` | Send the official 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 PDF user manual |
| `.prefix` | View or change the command prefix |
| `.mode public\|private` | Toggle public / owner-only mode |
| `.replymode buttons\|text` | Switch between button UI and text UI |
| `.settings` | Overview of all toggles and modes |
| `.update` | Pull latest code from the repository |
| `.script` / `.repo` | Show repository details |
| `.owner` | Show bot owner contact card |

---

### 👻 Ghost — Anti-Delete / Anti-Edit

Silently captures deleted and edited messages, media, and view-once content, 
then forwards to owner chat.

| Command | Description |
|---|---|
| `.ghost` | Show current status and menu |
| `.ghost on\|off` | Toggle anti-delete watcher |
| `.ghost edit on\|off` | Toggle anti-edit watcher |

*Ghost ignores your own messages and uses bounded memory queues.*

---

### 🌒 Lurk — Status Watcher

Auto-view, react, and download WhatsApp statuses without marking them seen.

| Command | Description |
|---|---|
| `.lurk` | Status watcher menu |
| `.lurk on\|off` | Toggle status auto-view |
| `.lurk react on\|off` | Toggle status auto-reaction |
| `.lurk download on\|off` | Toggle status media download |
| `.lurk emoji <emoji\|random\|none>` | Set reaction emoji |

---

### 👁️ Peek — View-Once Revealer

| Command | Description |
|---|---|
| `.peek` | View peek settings |
| `.peek auto on\|off` | Auto view-once capture |
| `.peek watch on\|off` | Quoted view-once watcher |
| `.peek dest <owner\|same\|both>` | Set reveal destination |

---

### 🤖 AI Tools

| Command | Description |
|---|---|
| `.gemini <prompt>` | Google Gemini chat (reply to quoted msg for context) |
| `.photo <prompt>` / `.imagine` | Generate AI image via Gemini photo models |
| `.scholar` / `.scholor <topic>` | University-professor style explanations |
| `.ppt <topic>` | AI-generated PowerPoint (.pptx) |
| `.quransearch <question>` | AI Quran verse search + explanation |
| `.hadeessearch <question>` | AI Hadith search + explanation |
| `.islamsearch <question>` | AI Quran + Hadith combined search |

---

### 🕌 Islamic Tools

| Command | Description |
|---|---|
| `.prayertimes <city>` / `.pts` | Daily prayer times worldwide |
| `.quran <surah:ayah>` | Verse lookup (Arabic + English) |
| `.search quran <topic>` | Keyword search in Quran translation |
| `.sora <surah>` | Full Surah PDF (1–114) |
| `.para <1-30>` | Juz / Para PDF |
| `.bukhari <number>` | Sahih Bukhari Hadith |
| `.muslim <number>` | Sahih Muslim Hadith |

---

### ⬇️ Downloaders

| Command | Description |
|---|---|
| `.play <song\|URL>` | YouTube / SoundCloud audio as MP3 |
| `.ytv <video\|URL>` / `.video` | YouTube video optimized for WhatsApp |
| `.ytdl <url>` | YouTube video via yt-dlp |
| `.youtube <url>` / `.yt` | YouTube video or audio |
| `.mp3 <url>` | Audio as MP3 |
| `.dl <url>` / `.dl audio\|mp3 <url>` | Universal downloader |
| `.pdl <url>` | Social post (IG, TikTok, FB) multi-media |
| `.pdlzip <url>` | Same as `.pdl`, bundled as ZIP |
| `.ig <username\|url>` | Instagram profile / post |
| `.tiktok <username\|url>` | TikTok video (no watermark) or stalk |
| `.fb <url>` | Facebook video |
| `.twitter <url>` / `.tw` | Twitter / X media |
| `.pinterest <url>` / `.pin` | Pinterest pin |
| `.threads <url>` | Threads media |
| `.reddit <url>` | Reddit media |
| `.gitdl <repo_url>` | GitHub repo as ZIP |
| `.mfdl <url>` | MediaFire file |
| `.ytcookies` | Manage YouTube cookies (status / clear / paste / reply-file) |

---

### 🎨 Media Tools

| Command | Description |
|---|---|
| `.sticker` / `.s` | Image / video / GIF to WebP sticker |
| `.toimg` / `.tovid` | Sticker to image / video |
| `.tomp3` | Video / audio to MP3 |
| `.vn` | Audio / video to WhatsApp voice note |
| `.trim <start> <end>` | Trim video / audio without re-encoding |
| `.compress` | Video < 10MB or image < 400KB |
| `.extracompress` | Image < 200KB |
| `.sanitize` / `.exifwipe` | Strip EXIF metadata |
| `.ocr` / `.readtext` | Extract text from image |
| `.tts <text>` | Text-to-speech voice note (multi-language) |
| `.vcard @user\|<number>` | Generate WhatsApp contact card |
| `.qr <text>` / `.qr read` | Generate or read QR code |
| `.barcode <text>` | Barcode (CODE128, EAN13, UPC, QR) |
| `.whatanime` | Identify anime scene from screenshot |
| `.url` | Upload media, get public link |
| `.web2img <url>` / `.webss` | Full-page screenshot |
| `.wp1`–`.wp10` / `.wp` / `.reset wp` | Wallpapers |

---

### 🛡️ Group Administration

| Command | Description |
|---|---|
| `.open` / `.close` | Open or close group (admins only) |
| `.kick` | Remove participant (reply or mention) |
| `.add <number>` | Add participant |
| `.promote` / `.demote` | Promote / demote admin |
| `.tagall [msg]` / `.tag` | Mention everyone |
| `.hidetag [msg]` | Silent mention everyone |
| `.kickall` | Kick all non-admins |
| `.kickcc <code>` | Kick members from country code |
| `.approveall` / `.declineall` | Approve / decline all join requests |
| `.leave` | Bot leaves group |
| `.join <link>` | Join group via invite link |
| `.ginfo <link>` | Inspect group metadata without joining |
| `.setgdesc <text>` | Set group description |
| `.setgpp` | Set group picture (reply to image) |
| `.welcome on\|off` | Welcome messages |
| `.goodbye on\|off` | Goodbye messages |
| `.antilink on\|off` | Antilink protection |
| `.antispam on\|off` | Antispam protection |
| `.antisticker on\|off` | Antisticker protection |
| `.pdd on\|off` | Promote/demote detection alerts |
| `.noaction @user [all]` / `.noaction off @user` / `.noaction list` | Protect users from demote/kick |
| `.pinchat` / `.unpinchat` | Pin / unpin chat |
| `.mute 8h\|1d\|forever` / `.unmute` | Mute / unmute notifications |
| `.archive` / `.unarchive` | Archive / unarchive chat |
| `.clearchat` | Clear chat window |
| `.disappearing 0s\|24h\|7d\|90d` | Disappearing messages timer |

---

### 👑 Owner & Session

| Command | Description |
|---|---|
| `.setpp` | Set bot profile picture (reply to photo) |
| `.setabout <text>` | Set bot about / status text |
| `.setstatus <text>` / `.setstatus` (reply media) | Post WhatsApp status |
| `.getstatus <number\|@mention>` | Fetch contact status story |
| `.getpair <number>` | Generate pairing code for new session |
| `.setsession <number>` | Set primary session owner |
| `.addsession <number>` | **Spawn a new session from inside WhatsApp** |
| `.delsession <id>` | Delete a session instance |
| `.addowner <number>` / `.delowner <number>` | Add / remove bot owner |
| `.ownerlist` | List all owners |
| `.setvar <KEY> <VALUE>` / `.getvar <KEY\|all>` / `.delvar <KEY>` | Manage persistent variables |
| `.forward <text\|reply> <JID\|Phone>` | Forward text / media to any target |
| `.getjid` | Show JID / LID for current or quoted chat |
| `.getpp [number\|jid]` | Fetch HD profile picture |
| `.chatstats <number\|jid>` | Message count stats |
| `.activity` | User activity dashboard |
| `.block` / `.unblock` | Block / unblock contact |
| `.blocklist` / `.unblockall` | Manage block list |
| `.rejectcalls on\|off` | Auto-reject voice / video calls |

---

### 🔒 Privacy & Presence

| Command | Description |
|---|---|
| `.presence` | Show presence settings |
| `.presence alwaysonline on\|off` | Always appear online |
| `.presence autotyping on\|off` | Auto-typing indicator |
| `.presence autorecording on\|off` | Auto-recording indicator |
| `.presence readreceipts on\|off` | Send / hide read receipts |

---

### 📡 Monitoring & Tracking

| Command | Description |
|---|---|
| `.stalk <number>` / `.stalk list` / `.stalk stop <number>` | Online/offline presence tracker |
| `.statusalert <number>` / `.statusalert off <number>` / `.statusalert list` | Alert when contact posts status |
| `.watch <number>` / `.watch off <number>` / `.watch list` | Alert on PP / about / name change |
| `.schedule <text> <YYYY-MM-DD> <HH:MM>` | Schedule message |
| `.schedule list` / `.schedule cancel <id>` | Manage scheduled tasks |

---

### 🧰 Utilities & Fun

| Command | Description |
|---|---|
| `.currency <amt> <from> <to>` | Currency conversion |
| `.define <word>` | Dictionary lookup |
| `.weather <city>` | Weather forecast |
| `.pwned <password>` | Password breach check |
| `.shorten <url>` | Shorten URL |
| `.unroll <url>` | Reveal final URL behind redirects |
| `.speedtest` | Network speed test |
| `.npm <package>` | NPM package info |
| `.tempmail` / `.readmail <addr>` | Temporary email + inbox |
| `.reqlocation` / `.relocation` | Request / share location |
| `.news [topic]` | Google News RSS |
| `.hackernews` / `.hn` | HackerNews top stories |
| `.wiki <topic>` | Wikipedia summary |
| `.joke` / `.advice` / `.fact` | Random fun content |
| `.book <title\|author>` / `.book dl <n>` | Book search & download |
| `.img <query> [count]` | Image search |
| `.couplepp` | Couple profile pictures |
| `.movie <title>` | Movie info |
| `.songinfo <title> [artist]` | Song metadata |
| `.lyrics <artist> - <title>` | Song lyrics |
| `.textmaker <effect> <text>` | Ephoto360 text effects (`.neon`, `.glitch`, `.marvel`, +50 more) |
| `.fancy <text>` / `.fancy 4 <text>` | Fancy Unicode text |
| `.dice [2d6\|3d8+2]` | Roll dice |
| `.coin [n]` | Flip coins |

---

## 🚀 Quick Start

**Requirements:** Node.js 20+, a WhatsApp account to link, optional PM2 for 
24/7 uptime.

```bash
git clone https://github.com/themalik-g/mehtab-md.git
cd mehtab-md
npm install
npm start
```

On first run, 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 prints an 8-character pairing code. Enter it in
WhatsApp → **Linked Devices → Link with phone number instead**.

### Add another number (from inside WhatsApp)
Once running, just send:

```
.addsession <phone_number>
```

𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 generates a pairing code, and you link the new number — no terminal
needed.

---

## 🖥️ Supported Platforms

𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 runs anywhere Node.js 20+ runs:

| Platform | Notes |
|---|---|
| VPS / Linux server | Recommended; use PM2 for auto-restart |
| Docker | Dockerfile included |
| PM2 | `npm run pm2:start` (config: `ecosystem.config.cjs`) |
| Pterodactyl / bot-hosting panels | Supported |
| Termux (Android) | Supported |

---

## 📖 Documentation

| File | Topic |
|---|---|
| [whatsapp-bot-commands.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-bot-commands.md) | Detailed command reference |
| [whatsapp-bot-configuration.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-bot-configuration.md) | Settings, state files, variables |
| [whatsapp-jid-system.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-jid-system.md) | PN, LID, JID resolution |
| [whatsapp-bot-deployment.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-bot-deployment.md) | VPS, Docker, PM2, panels |
| [whatsapp-bot-troubleshooting.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-bot-troubleshooting.md) | Common errors and fixes |
| [whatsapp-bot-architecture.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-bot-architecture.md) | Module design and router flow |
| [mehtab-md-vs-other-whatsapp-bots.md](https://github.com/themalik-g/mehtab-md/blob/main/docs/mehtab-md-vs-other-whatsapp-bots.md) | Feature comparison vs other bots |

---

## ❓ FAQ

**What is 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃?**
𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 is a free, open-source, self-hosted WhatsApp multi-device bot built with Node.js and Baileys v7. It adds anti-delete, view-once reveal, status saving, downloaders, Gemini AI and group management to your own WhatsApp number.

**How do I install a WhatsApp bot with 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃?**
Clone the repository, run `npm install`, start it with `npm start`, enter your number and link it with the 8-character pairing code. See [Quick Start](#-quick-start).

**Does 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 support interactive WhatsApp buttons?**
Yes. Quick-reply, single-select, URL and call buttons work natively on the latest Baileys protocol — no fork required.

**Can 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 recover deleted WhatsApp messages?**
Yes. The Ghost module logs messages and forwards deleted or edited ones back to the owner.

**Can 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 reveal view-once photos and videos?**
Yes. The Peek module captures view-once media and sends it to the owner chat.

**Can I add a new WhatsApp session without leaving the chat?**  
Yes. Use `.addsession <number>` inside WhatsApp. No terminal, SSH or dashboard.

**Does 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 support FullDP and HDDP profile pictures?**
Yes. Full-resolution and HD profile pictures are fetched on stock Baileys.

**Does the YouTube downloader require cookies?**  
No. It works without cookies, a Google account or any authentication. Optional `.ytcookies` for edge cases.

**Which Baileys version does 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 use?**
`@whiskeysockets/baileys` **v7.0.0-rc.14** — the latest release-candidate line.

**Does it need a QR code to log in?**  
No. It uses an 8-character pairing code via "Link with phone number instead".

**Can I run multiple WhatsApp numbers?**  
Yes. Multi-session is built in — add numbers from inside WhatsApp.

**Is 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 free?**
Yes. It is MIT-licensed and free to use, modify and distribute.

**Is it safe for my account?**  
𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 uses the official multi-device protocol through Baileys, but any unofficial client carries some risk. Use responsibly and avoid spam.

**Which Node.js version is required?**  
Node.js 20 or newer.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| "Waiting for this message" | Update to v1.3.3 — persistent message store fixes retry |
| Bot won't pair | Delete `session/`, restart, re-enter number |
| `internal-server-error` on admin command | Bot must be admin; ensure target PN resolves |
| Buttons not rendering | Update to latest 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃; some clients cache old UIs |
| LID not resolving | Reply to their message in a group first |
| YouTube download fails | Update yt-dlp; only use `.ytcookies` if truly needed |

Full guide: [Troubleshooting doc](https://github.com/themalik-g/mehtab-md/blob/main/docs/whatsapp-bot-troubleshooting.md)

---

## 🤝 Contributing

Issues and pull requests are welcome. If you found a bug or want a feature, [open an issue](https://github.com/themalik-g/mehtab-md/issues). If 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 helps you, **star the repository** so more people can find it.

---

## 🔒 Security

Never commit `instances/`, `session/`, `.env`, `keys.env`, `state/` or `creds.json`. Rotate API keys if they were ever pushed.

---

## ⚠️ Disclaimer

𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 is not affiliated with or endorsed by WhatsApp or Meta. Use at your own risk and respect privacy laws and WhatsApp's Terms of Service.

---

## 📜 License

[MIT](https://github.com/themalik-g/mehtab-md/blob/main/LICENSE) © MALIK MEHTAB

---

## 🙏 Credits

- Built on [Baileys](https://github.com/WhiskeySockets/Baileys) v7.0.0-rc.14
- Downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [@postfetch/core](https://github.com/postfetch/core)
- Repository: [themalik-g/mehtab-md](https://github.com/themalik-g/mehtab-md)

---

<div align="center">

**⭐ If 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 helped you, consider giving it a star! ⭐**

</div>
