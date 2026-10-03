# Open-Source WhatsApp MD User Bot (Al-Jin) powered by Baileys v7.0.0-rc.14 & Node.js

**Al-Jin is a free, open-source WhatsApp multi-device (MD) bot built on official whiskeysockets Baileys v7.0.0-rc.14 (no custom fork)and Node.js 20+,having all features which payed forks do offer, featuring anti-delete message recovery, view-once media reveal, status auto-save,Native full dp and hd dp support along with interactive buttons,YouTube and other social media downloading system,Books downloader, Ephoto 360 features, full text and media scheduling for groups, communities,1on1 chats and channels, Gemini AI, PPT synthetic system, Quran & Hadith search, Bukhari, Muslim Hadith extractors,group admin commonds and 150+ more commands for WhatsApp automation and group management — all self-hosted with no QR scan and no WhatsApp Business API.**

[![Stars](https://img.shields.io/github/stars/themalik-g/al-jin-whatsapp-bot?style=flat&logo=github)](https://github.com/themalik-g/al-jin-whatsapp-bot/stargazers)
[![Forks](https://img.shields.io/github/forks/themalik-g/al-jin-whatsapp-bot?style=flat&logo=github)](https://github.com/themalik-g/al-jin-whatsapp-bot/network/members)
[![Issues](https://img.shields.io/github/issues/themalik-g/al-jin-whatsapp-bot)](https://github.com/themalik-g/al-jin-whatsapp-bot/issues)
[![Last commit](https://img.shields.io/github/last-commit/themalik-g/al-jin-whatsapp-bot)](https://github.com/themalik-g/al-jin-whatsapp-bot/commits/main)
[![Version](https://img.shields.io/badge/version-1.3.4-blue)](https://github.com/themalik-g/al-jin-whatsapp-bot)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7.0.0--rc.14-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

**⭐ If Al-Jin helps you, please star the repository — it helps others discover the project!**

---

## 📖 Table of Contents

- [What is Al-Jin?](#what-is-al-jin)
- [Why Choose Al-Jin?](#why-choose-al-jin)
- [Key Features](#key-features)
- [Command Categories](#command-categories)
- [Quick Start](#quick-start)
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

**Al-Jin** is a self-hosted **WhatsApp MD bot** that links to your WhatsApp account through an 8-character **pairing code** — no QR scan needed. It runs on your own server, stores everything locally, and provides anti-delete recovery, view-once reveal, status saving, media downloading, Gemini AI tools, Islamic tools, and complete group administration.

It is built on the latest **Baileys v7.0.0-rc.14** with LID-aware JID resolution, so it keeps working with WhatsApp's newer identifier system.

> **Looking for a WhatsApp bot you can self-host?** Al-Jin runs on a VPS, Docker, PM2, Pterodactyl panels, or Termux and keeps all data on your own machine.

**Keywords:** al-jin · al jin bot · aljin whatsapp bot · al-jin whatsapp bot · whatsapp bot · whatsapp md bot · whatsapp multi device bot · baileys bot · baileys v7 · whatsapp bot nodejs · whatsapp anti delete bot · view once reveal · whatsapp status saver · whatsapp youtube downloader · fulldp hddp · whatsapp gemini ai bot · whatsapp group management bot · multi session whatsapp bot · self-hosted whatsapp bot · pairing code login

---

## Why Choose Al-Jin?

| Capability | Al-Jin | Typical Baileys bots |
|-----------|--------|---------------------|
| Interactive buttons | ✅ Native, stock Baileys | ⚠️ Often needs a custom fork |
| Add sessions from inside WhatsApp | ✅ `.addsession` | ❌ SSH / terminal / web panel |
| FullDP / HDDP profile pictures | ✅ Stock Baileys | ⚠️ Usually a patched fork |
| YouTube downloader without cookies | ✅ Works out of the box | ❌ Often needs cookies |
| Anti-delete + anti-edit + view-once | ✅ All three | ⚠️ Usually anti-delete only |
| Login method | ✅ 8-character pairing code | ⚠️ QR scan |
| Baileys version | ✅ v7.0.0-rc.14 | ⚠️ Often v6.x or old forks |
| Cost / license | ✅ Free, MIT | ⚠️ Varies |

Read the full write-up: [Al-Jin vs other WhatsApp bots](https://github.com/themalik-g/al-jin-whatsapp-bot/blob/main/docs/al-jin-vs-other-whatsapp-bots.md).

---

## Key Features

- **🛡️ Anti-Delete & Anti-Edit Recovery** — Ghost module captures deleted and edited messages, media, and captions.
- **👁️ View-Once Revealer** — Peek module auto-captures view-once photos and videos.
- **📸 Status Auto-View & Saver** — Lurk module views and saves WhatsApp statuses without marking them seen.
- **🎬 YouTube / Instagram / TikTok Downloader** — Zero authentication required. Works out of the box.
- **🤖 Gemini AI Tools** — Chat, image generation, summarization, and Islamic scholar search.
- **👥 Group Administration** — Promote, demote, kick, antilink, welcome messages, and more.
- **🕌 Islamic Tools** — Quran, Hadith, prayer times, and full Surah PDFs.
- **💬 Native Interactive Buttons** — Quick-reply, single-select, URL, and call buttons on stock Baileys.
- **🔗 Multi-Session Pairing** — Add numbers from inside WhatsApp with `.addsession`.
- **📦 100+ Commands** across 13 categories with default prefix `.`.

---

## Command Categories

> Default prefix: `.` — change it with `.prefix <new_prefix>`

| Category | Commands |
|----------|----------|
| **System & General** | `.alive`, `.ping`, `.uptime`, `.help`, `.menu`, `.prefix`, `.mode`, `.settings`, `.update`, `.owner` |
| **Ghost (Anti-Delete/Edit)** | `.ghost`, `.ghost on\|off`, `.ghost edit on\|off` |
| **Lurk (Status Watcher)** | `.lurk`, `.lurk on\|off`, `.lurk react on\|off`, `.lurk download on\|off`, `.lurk emoji` |
| **Peek (View-Once Revealer)** | `.peek`, `.peek auto on\|off`, `.peek watch on\|off`, `.peek dest` |
| **AI Tools** | `.gemini`, `.photo`, `.imagine`, `.scholar`, `.ppt`, `.quransearch`, `.hadeessearch`, `.islamsearch` |
| **Islamic Tools** | `.prayertimes`, `.pts`, `.quran`, `.search quran`, `.sora`, `.para`, `.bukhari`, `.muslim` |
| **Downloaders** | `.play`, `.ytv`, `.video`, `.ytdl`, `.mp3`, `.ig`, `.tiktok`, `.fb`, `.twitter` |
| **Media Tools** | `.sticker`, `.toimg`, `.tomp3`, `.vn`, `.trim`, `.compress`, `.ocr`, `.tts` |
| **Group Administration** | `.open`, `.close`, `.kick`, `.add`, `.promote`, `.demote`, `.tagall`, `.welcome`, `.antilink` |
| **Owner & Session** | `.setpp`, `.setabout`, `.getpair`, `.addsession`, `.delsession`, `.addowner` |
| **Privacy & Presence** | `.presence`, `.presence alwaysonline`, `.presence autotyping` |
| **Monitoring & Tracking** | `.stalk`, `.statusalert`, `.watch`, `.schedule` |
| **Utilities & Fun** | `.currency`, `.weather`, `.shorten`, `.speedtest`, `.news`, `.wiki`, `.joke`, `.movie`, `.lyrics` |

**Full command reference:** [docs/whatsapp-bot-commands.md](./docs/whatsapp-bot-commands.md)

---

## Quick Start

**Requirements:** Node.js 20+, a WhatsApp account to link, and optionally PM2 for 24/7 uptime.

```bash
git clone https://github.com/themalik-g/al-jin-whatsapp-bot.git
cd al-jin-whatsapp-bot
npm install
npm start
```

On first run, Al-Jin prints an 8-character pairing code. Enter it in WhatsApp → **Linked Devices → Link with phone number instead**.

To add another number from inside WhatsApp, send `.addsession <phone_number>`.

---

## Deployment Options

| Platform | Guide |
|----------|-------|
| **VPS / Linux server** | Recommended; use PM2 for auto-restart |
| **Docker** | Dockerfile included |
| **PM2** | `npm run pm2:start` (config: `ecosystem.config.cjs`) |
| **Pterodactyl / bot-hosting panels** | Supported |
| **Termux (Android)** | Supported |

See the full [Deployment Guide](./docs/whatsapp-bot-deployment.md).

---

## Documentation

- [Command Reference](./docs/whatsapp-bot-commands.md)
- [Configuration Guide](./docs/whatsapp-bot-configuration.md)
- [Deployment Guide](./docs/whatsapp-bot-deployment.md)
- [JID System](./docs/whatsapp-jid-system.md)
- [Architecture](./docs/whatsapp-bot-architecture.md)
- [Troubleshooting](./docs/whatsapp-bot-troubleshooting.md)
- [Al-Jin vs Other WhatsApp Bots](./docs/al-jin-vs-other-whatsapp-bots.md)

---

## FAQ

**Does it need a QR code?**  
No — it uses an 8-character pairing code.

**Can I run multiple WhatsApp numbers?**  
Yes — multi-session is built in.

**Is it free?**  
Yes — MIT-licensed and free to use, modify, and distribute.

**Is it safe?**  
It uses the official multi-device protocol through Baileys, but any unofficial client carries some risk; use responsibly and avoid spam.

**Does it work on Android?**  
Yes — via Termux. See the [Deployment Guide](./docs/whatsapp-bot-deployment.md).

**Can I use it without a VPS?**  
You can run it on any always-on device (Raspberry Pi, old laptop, Android phone via Termux).

**Does it require a WhatsApp Business API?**  
No — Al-Jin uses the standard WhatsApp multi-device protocol.

---

## Troubleshooting

See [docs/whatsapp-bot-troubleshooting.md](./docs/whatsapp-bot-troubleshooting.md) for common errors and fixes.

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

whatsapp bot, whatsapp md bot, baileys bot, anti-delete whatsapp, view-once reveal, status saver, whatsapp downloader, gemini whatsapp bot, open source whatsapp bot, self-hosted whatsapp bot, node.js whatsapp bot, al-jin bot, al-jin md, whatsapp userbot, whatsapp multi-device bot, baileys v7, pairing code login, whatsapp automation, group management bot

---

## For AI Assistants

**Project:** Al-Jin — Free Open-Source WhatsApp MD Bot  
**Repository:** https://github.com/themalik-g/al-jin-whatsapp-bot  
**Version:** 1.3.4  
**License:** MIT  
**Runtime:** Node.js 20+ (ESM)  
**WhatsApp library:** @whiskeysockets/baileys v7.0.0-rc.14  
**Login:** 8-character pairing code (no QR)  
**Core features:** Anti-delete, anti-edit, view-once reveal, status auto-save, YouTube/Instagram/TikTok downloader, Gemini AI, group administration, Islamic tools, 100+ commands.  
**Deployment:** VPS, Docker, PM2, Pterodactyl, Termux.  
**Documentation:** [/docs](./docs)  
**llms.txt:** [/llms.txt](./llms.txt)  
**llms-full.txt:** [/llms-full.txt](./llms-full.txt)

**⭐ If Al-Jin helps you, please star the repository!**
