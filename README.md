<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&weight=700&size=34&duration=3000&pause=1000&color=00E5FF&center=true&vCenter=true&width=900&height=70&lines=WRAITH+%E2%80%94+WhatsApp+Bot;Anti-Delete+%7C+View-Once+Peek+%7C+Status+Lurk;YouTube+%26+Instagram+Downloader+for+WhatsApp;Multi-Device+%7C+Baileys+v7+%7C+Node.js+20%2B" alt="WRAITH WhatsApp Bot typing banner"/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0052D4,50:1E88E5,100:00E5FF&height=200&section=header&text=WRAITH&fontSize=80&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=A%20silent%20watcher%20for%20WhatsApp&descAlignY=60" width="100%" alt="WRAITH header"/>

<p>
  <a href="https://github.com/themalik-g/wraith/releases"><img src="https://img.shields.io/badge/version-1.3.3-0D47A1?style=for-the-badge&logo=github&logoColor=white&labelColor=000000" alt="Version"/></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?style=for-the-badge&logo=node.js&logoColor=white&labelColor=000000" alt="Node.js 20+"/>
  <img src="https://img.shields.io/badge/Baileys-v7-25D366?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=000000" alt="Baileys v7"/>
  <img src="https://img.shields.io/badge/Multi--Device-Supported-1E88E5?style=for-the-badge&labelColor=000000" alt="Multi-device"/>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-DC2626?style=for-the-badge&logo=opensourceinitiative&logoColor=white&labelColor=000000" alt="MIT License"/></a>
</p>
<p>
  <img src="https://img.shields.io/github/stars/themalik-g/wraith?style=social" alt="GitHub stars"/>
  <img src="https://img.shields.io/github/forks/themalik-g/wraith?style=social" alt="GitHub forks"/>
  <img src="https://img.shields.io/github/last-commit/themalik-g/wraith?color=00E5FF&label=last%20commit" alt="Last commit"/>
</p>

**[Features](#-features) · [Quick Start](#-quick-start) · [Commands](#-command-highlights) · [Docs](#-documentation) · [FAQ](#-faq) · [Support](#-support)**

</div>

---

## 📖 What is WRAITH?

**WRAITH** is a free, open-source **WhatsApp bot** for Node.js built on **[Baileys v7](https://github.com/WhiskeySockets/Baileys)** (multi-device, no browser needed). It quietly watches your account and gives you **anti-delete / anti-edit message recovery**, **view-once media reveal**, **status auto-view & download**, **scheduled messages**, a **YouTube / Instagram / TikTok downloader**, **AI (Gemini) tools**, and full **group administration**, all with LID-aware JID resolution.

> **Keywords:** WhatsApp bot · WhatsApp anti-delete · view-once downloader · WhatsApp status saver · WhatsApp YouTube downloader · Baileys bot · multi-device WhatsApp bot · Node.js WhatsApp automation · Gemini WhatsApp bot · WhatsApp group manager

### ⚡ At a glance

| | |
|---|---|
| **Type** | WhatsApp userbot / automation bot (linked device) |
| **Language / Runtime** | JavaScript (ESM) · Node.js ≥ 20 |
| **WhatsApp library** | `@whiskeysockets/baileys` v7 |
| **Login method** | Pairing code (no QR needed) |
| **Multi-session** | Yes, run several numbers from one install |
| **Deploy targets** | VPS · PM2 · Docker · Pterodactyl panels |
| **License** | MIT |
| **Repository** | https://github.com/themalik-g/wraith |

---

## ✨ Features

| Module | What it does |
|---|---|
| 👻 **Ghost** | Anti-delete, anti-edit and secret-edit tracking. Deleted or edited messages (with media) are sent back to the owner. |
| 👁️ **Peek** | Reveals view-once images, videos and audio, with auto-peek and quoted-message detection. |
| 🌒 **Lurk** | Auto-view statuses, auto-react with custom or random emojis, silently save status media to your DM. |
| 📅 **Schedule** | Schedule any message, or group open/close, for a future time, with retries and owner notices. |
| ⬇️ **Downloader** | `.dl` `.play` `.ytv` `.video` `.ytdl` `.mp3` `.pdl` `.pdlzip`: YouTube video/audio (up to 400 MB) and image carousels from Instagram, TikTok, Pinterest, Twitter and Facebook via `@postfetch/core` + `yt-dlp`. |
| 📦 **File & Social** | GitHub repo (`.gitdl`), MediaFire (`.mfdl`), profile search and media (`.ig` `.tiktok` `.fb`), songs (`.song`). |
| 🤖 **AI & Media** | Gemini assistant (`.gemini`), AI photos (`.photo`), PowerPoint generator (`.ppt`), 54 Ephoto360 text effects (`.textmaker`), book search, stock images, lyrics, movies, couple PPs. |
| 👥 **Admin & Group** | `.open` `.close` `.kick` `.add` `.promote` `.demote` `.approveall` `.kickall` `.tagall` `.hidetag` `.welcome` `.goodbye` plus `.antilink` `.antispam` `.antisticker` `.rejectcalls`. |
| 👤 **Owner & Profile** | Multi-owner, block list, `.setstatus`, `.getpair`, `.setsession`, `.setpp`, `.setabout`, `.stalk`, `.mode` public/private, `.prefix`. |
| 🛠️ **Utilities** | Weather, currency, dictionary, QR generate/decode, URL upload/shorten, news, Wikipedia, password-breach check, jokes, facts. |
| 📌 **JID tools** | PN ⇄ LID resolver, channel list, group roster with admin roles, profile picture fetcher. |
| ⚙️ **Presence** | Always online, auto-typing, auto-recording, read-receipt control. |
| 📊 **Activity & Ping** | Chat activity dashboard and latency/memory probe. |
| 📄 **User Manual** | `.usermanual` sends the full manual as a WhatsApp PDF. |

---

## 🚀 Quick Start

**Requirements:** Node.js 20+, a WhatsApp account to link, optional PM2 for 24/7 uptime.

```bash
git clone https://github.com/themalik-g/wraith.git
cd wraith
npm install
npm start
```

On first run enter your number (country code, digits only). WRAITH prints an **8-character pairing code**:

> WhatsApp → Settings → **Linked Devices** → Link a Device → **Link with phone number instead**

**Headless / panels:** set `WRAITH_PHONE=923001234567` (or `--phone=...`) and the bot pairs automatically.

```bash
# 24/7 with PM2
npm run pm2:start
npm run pm2:logs
npm run pm2:restart

# Add another number later
node start.js --add
```

<details>
<summary><b>🐳 Docker</b></summary>

```bash
docker build -t wraith .
docker run -d --name wraith -e WRAITH_PHONE=923001234567 \
  -v $(pwd)/instances:/app/instances wraith
```
</details>

---

## 🎮 Command highlights

| Goal | Command |
|---|---|
| Open the menu | `.menu` · `.menu ghost` |
| Download a video | `.dl <url>` · `.ytv <url>` |
| Download audio | `.mp3 <url>` · `.play <song>` |
| Ask Gemini | `.gemini <question>` |
| Make slides | `.ppt <topic>` |
| Reveal view-once | reply with `.peek` |
| Schedule a message | `.schedule` · `.schedule list` · `.schedule cancel <id>` |
| Switch reply style | `.replymode text` / `.replymode buttons` |

Full list: [docs/COMMANDS.md](./docs/COMMANDS.md)

---

## 🧠 LID-aware JID system

Every WhatsApp user has two identifiers: a **PN JID** (`923001234567@s.whatsapp.net`) and a **LID** (`278713363128439@lid`). WRAITH resolves both, sends to LIDs directly, and uses five fallback strategies to recover phone numbers when WhatsApp hides them. → [docs/JID-SYSTEM.md](./docs/JID-SYSTEM.md)

---

## 🛡️ Reliability (v1.3.3)

- **No more "Waiting for this message…"**: persistent message store (survives restarts), retry-aware relay storage, longer retry cache and group-metadata caching.
- **LID-aware owner checks**: primary owner, secondary owners (`.addowner`) and the developer are recognised even when WhatsApp sends senders as `@lid`.
- `.menu` / `.help` show a banner image (override with `WRAITH_MENU_IMAGE`) and fall back to text if it can't load.
- Auto re-pair after logout, exponential-backoff reconnects, atomic state writes.
- Memory-friendly: capped caches and periodic GC for small panels (256 MB default heap).

---

## ⚙️ Configuration

```javascript
// config.js (per-session overrides live in instances/<id>/state/config.json)
export const CONFIG = {
  botName: "WRAITH",
  timezone: "Asia/Karachi",
  reconnectDelay: 3000,
  vaultMaxMB: 200,
};
```

| Environment variable | Purpose | Default |
|---|---|---|
| `WRAITH_PHONE` | Auto-pair this number | none |
| `WRAITH_REPLY_MODE` | `text` or `buttons` | `text` |
| `WRAITH_MSG_STORE_MAX` | Retry-store size | `3000` |
| `WRAITH_MSG_STORE_TTL_H` | Retry-store lifetime (hours) | `24` |
| `WRAITH_MAX_OLD_SPACE_SIZE` | Node heap (MB) | `256` |
| `WRAITH_MENU_IMAGE` | Image URL shown on `.menu` | built-in banner |
| `WRAITH_DEBUG` | Verbose logs (`1`) | off |

---

## 📁 Project structure

```
wraith/
├── index.js            # launcher: multi-session supervisor
├── start.js            # per-session worker (socket, stores, caches)
├── router.js           # command dispatch
├── config.js
├── core/               # identity, settings, JID resolver, vault, state I/O
├── lib/                # buttons, downloaders, ffmpeg, ppt engine, net helpers
├── modules/            # one file per feature (ghost, peek, lurk, admin, ...)
├── docs/               # full documentation
└── instances/<id>/     # session, state, vault, logs (git-ignored)
```

---

## 📚 Documentation

| File | Topic |
|---|---|
| [COMMANDS.md](./docs/COMMANDS.md) | Every command with examples |
| [CONFIGURATION.md](./docs/CONFIGURATION.md) | Settings, state files, variables |
| [JID-SYSTEM.md](./docs/JID-SYSTEM.md) | PN, LID and JID resolution |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | VPS, Docker, PM2, panels |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common errors and fixes |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Module design and router flow |

---

## ❓ FAQ

**How do I stop "Waiting for this message. This may take a while"?**
Update to v1.3.3. Messages are now stored persistently so WhatsApp retry requests succeed. If old sessions are corrupted, delete `session-*.json` and `sender-key-*.json` in `instances/<id>/session/` (keep `creds.json`). See [Troubleshooting](./docs/TROUBLESHOOTING.md).

**Can WRAITH recover deleted WhatsApp messages?**
Yes. The Ghost module logs messages and sends deleted or edited ones back to the owner.

**Does it need a QR code?**
No. It links with a pairing code via "Link with phone number instead".

**Can I run multiple numbers?**
Yes. Use `node start.js --add`; each number gets its own isolated `instances/<id>/` folder.

**Is it safe for my account?**
WRAITH uses the official multi-device protocol through Baileys, but any unofficial client carries some risk. Use it responsibly and avoid spam.

**Which Node.js version?**
Node.js 20 or newer.

---

## 🐛 Quick troubleshooting

| Problem | Fix |
|---|---|
| "Waiting for this message" | Update to v1.3.3, see FAQ above |
| Bot won't pair | Delete `session/`, restart, re-enter number |
| `internal-server-error` on admin | Bot must be admin; resolve target PN first |
| Image post download failed | Use `.pdl <url>` or `.pdlzip <url>` |
| LID not resolving | Reply to their message in a group first |

---

## 🔐 Security

Never commit `instances/`, `session/`, `.env`, `keys.env` or `creds.json`. Rotate API keys if they were ever pushed.

## ⚠️ Disclaimer

WRAITH is not affiliated with or endorsed by WhatsApp or Meta. Use at your own risk and respect privacy laws and WhatsApp's Terms of Service.

## 🤝 Contributing

Issues and PRs are welcome. Run `node --check` on changed files and the tests in `/test` before opening a PR.

## 💬 Support

Open an [issue](https://github.com/themalik-g/wraith/issues) or message the owner via the in-bot `.owner` contact.

## 📜 License

[MIT](./LICENSE) © MALIK MEHTAB

## 🙏 Credits

[Baileys](https://github.com/WhiskeySockets/Baileys) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [@postfetch/core](https://jsr.io/@postfetch/core) · built by [@themalik-g](https://github.com/themalik-g)

<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&size=16&duration=3000&pause=1000&color=00E5FF&center=true&vCenter=true&width=600&lines=%E2%AD%90+Star+this+repo+if+it+helps+you!;%F0%9F%8D%B4+Fork+to+contribute!;%F0%9F%92%AC+Issues+and+PRs+are+welcome!" alt="Footer typing banner"/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00E5FF,50:1E88E5,100:0052D4&height=130&section=footer" width="100%" alt="footer"/>

**Made with ❤️ by MALIK MEHTAB**

<sub>Topics: whatsapp-bot · baileys · whatsapp-automation · anti-delete · view-once · youtube-downloader · nodejs · multi-device · gemini-ai · whatsapp-md</sub>

</div>
