# WRAITH — WhatsApp MD Bot (Baileys v7.0.0-rc.14)

**WRAITH is a free, open-source WhatsApp multi-device (MD) bot** built on 
**Baileys v7.0.0-rc.14** and Node.js 20+. It ships **native interactive 
buttons**, **in-WhatsApp multi-session pairing**, **FullDP / HDDP profile 
pictures** on stock Baileys, a **cookie-free YouTube downloader**, 
**anti-delete / anti-edit / view-once recovery**, **Gemini AI**, a full 
**Islamic toolset**, and complete **group administration** — no browser, no 
QR scan, no WhatsApp Business API, no custom fork required.

<div align="center">

[![Version](https://img.shields.io/badge/version-1.3.3-blue)](https://github.com/themalik-g/wraith)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7.0.0-rc.14-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

**Keywords:** whatsapp bot · whatsapp md bot · baileys bot · interactive buttons · 
anti-delete · view-once reveal · status saver · youtube downloader · 
fulldp hddp · gemini bot · multi-session whatsapp · self-hosted

</div>

---

## 📖 Table of Contents

- [What is WRAITH?](#-what-is-wraith)
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
- [Documentation](#-documentation)
- [FAQ](#-faq)
- [Troubleshooting](#-troubleshooting)
- [Security](#-security)
- [License](#-license)
- [Credits](#-credits)

---

## 🌟 What is WRAITH?

**WRAITH** is a self-hosted **WhatsApp MD bot** that links to your WhatsApp 
account via an 8-character **pairing code** — no QR scan. It runs on your own 
server (VPS, Docker, PM2, Pterodactyl, or Termux), stores all data locally, 
and gives you a full command suite for **recovering deleted messages**, 
**saving statuses**, **downloading social media**, **chatting with Gemini AI**, 
**Islamic tools**, and **managing groups**.

Built on the latest **Baileys v7.0.0-rc.14** with LID-aware JID resolution.

---

## ⭐ Standout Features

### 🔘 Native Interactive Buttons
Quick-reply, single-select, URL, and call buttons — supported natively on the 
latest Baileys protocol. **No custom fork, no broken listeners.** Switch 
between button UI and text UI anytime with `.replymode`.

### 🧩 In-WhatsApp Multi-Session Pairing
Add another WhatsApp number **without ever leaving the chat**. Just send 
`.addsession <number>` inside WhatsApp and follow the pairing code — no SSH, 
no terminal, no dashboard. Run several numbers from one install, each with 
its own isolated session.

### 🖼️ FullDP & HDDP Profile Pictures
Fetch **full-resolution** and **HD** profile pictures of any user or group — 
on the **standard Baileys library**, not a patched fork.

### 🎬 YouTube Downloader With Zero Authentication
Download YouTube video and audio **without cookies**, **without a Google 
account**, and **without any OAuth flow**. Optional `.ytcookies` support 
exists for edge cases, but normal downloads just work.

### 📡 Latest Baileys
Built on **`@whiskeysockets/baileys v7.0.0-rc.14`**. New protocol fixes, button 
support, and multi-device improvements land in WRAITH fast.

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
| `.usermanual` | Send the official WRAITH PDF user manual |
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
git clone https://github.com/themalik-g/wraith.git
cd wraith
npm install
npm start
```

On first run, WRAITH prints an 8-character pairing code. Enter it in 
WhatsApp → **Linked Devices → Link with phone number instead**.

### Add another number (from inside WhatsApp)
Once running, just send:

```
.addsession <phone_number>
```

WRAITH generates a pairing code, and you link the new number — no terminal 
needed.

---

## 📖 Documentation

| File | Topic |
|---|---|
| [whatsapp-bot-commands.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-commands.md) | Detailed command reference |
| [whatsapp-bot-configuration.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-configuration.md) | Settings, state files, variables |
| [whatsapp-jid-system.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-jid-system.md) | PN, LID, JID resolution |
| [whatsapp-bot-deployment.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-deployment.md) | VPS, Docker, PM2, panels |
| [whatsapp-bot-troubleshooting.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-troubleshooting.md) | Common errors and fixes |
| [whatsapp-bot-architecture.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-architecture.md) | Module design and router flow |
| [wraith-vs-other-whatsapp-bots.md](https://github.com/themalik-g/wraith/blob/main/docs/wraith-vs-other-whatsapp-bots.md) | Feature comparison vs other bots |

---

## ❓ FAQ

**Does WRAITH support interactive WhatsApp buttons?**  
Yes. Quick-reply, single-select, URL, and call buttons work natively on the 
latest Baileys protocol — no fork required.

**Can I add a new WhatsApp session without leaving the chat?**  
Yes. Use `.addsession <number>` inside WhatsApp. No terminal, SSH, or 
dashboard.

**Does WRAITH support FullDP and HDDP profile pictures?**  
Yes. Full-resolution and HD profile pictures are fetched on stock Baileys.

**Does the YouTube downloader require cookies?**  
No. It works without cookies, a Google account, or any authentication. 
Optional `.ytcookies` for edge cases.

**Which Baileys version does WRAITH use?**  
`@whiskeysockets/baileys` **v7.0.0-rc.14** — the latest release-candidate line.

**Can WRAITH recover deleted WhatsApp messages?**  
Yes. The Ghost module logs messages and forwards deleted or edited ones back 
to the owner.

**Does it need a QR code to log in?**  
No. It uses an 8-character pairing code via "Link with phone number instead".

**Can I run multiple numbers?**  
Yes. Multi-session is built in — add numbers from inside WhatsApp.

**Is it safe for my account?**  
WRAITH uses the official multi-device protocol through Baileys, but any 
unofficial client carries some risk. Use responsibly and avoid spam.

**Which Node.js version is required?**  
Node.js 20 or newer.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| "Waiting for this message" | Update to v1.3.3 — persistent message store fixes retry |
| Bot won't pair | Delete `session/`, restart, re-enter number |
| `internal-server-error` on admin command | Bot must be admin; ensure target PN resolves |
| Buttons not rendering | Update to latest WRAITH; some clients cache old UIs |
| LID not resolving | Reply to their message in a group first |
| YouTube download fails | Update yt-dlp; only use `.ytcookies` if truly needed |

Full guide: [Troubleshooting doc](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-troubleshooting.md)

---

## 🔒 Security

Never commit `instances/`, `session/`, `.env`, `keys.env`, or `creds.json`. 
Rotate API keys if they were ever pushed.

---

## ⚠️ Disclaimer

WRAITH is not affiliated with or endorsed by WhatsApp or Meta. Use at your 
own risk and respect privacy laws and WhatsApp's Terms of Service.

---

## 📜 License

[MIT](https://github.com/themalik-g/wraith/blob/main/LICENSE) © MALIK MEHTAB

---

## 🙏 Credits

- Built on [Baileys](https://github.com/WhiskeySockets/Baileys) v7.0.0-rc.14
- Downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and 
  [@postfetch/core](https://github.com/postfetch/core)
- Repository: [themalik-g/wraith](https://github.com/themalik-g/wraith)

---

<div align="center">

**⭐ If WRAITH helped you, consider giving it a star! ⭐**

</div>
