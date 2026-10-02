# Al-Jin — Free Open-Source WhatsApp MD Bot (Baileys v7, Multi-Device, Node.js)

**Al-Jin is a free, open-source WhatsApp multi-device (MD) bot built on Baileys v7 and Node.js 20+, featuring anti-delete message recovery, view-once media reveal, status auto-save, YouTube downloader, Gemini AI, and 100+ commands for WhatsApp automation and group management — all self-hosted with no QR scan and no WhatsApp Business API.**

[![Stars](https://img.shields.io/github/stars/themalik-g/al-jin-whatsapp-bot?style=flat&logo=github)](https://github.com/themalik-g/al-jin-whatsapp-bot/stargazers)
[![Forks](https://img.shields.io/github/forks/themalik-g/al-jin-whatsapp-bot?style=flat&logo=github)](https://github.com/themalik-g/al-jin-whatsapp-bot/network/members)
[![Issues](https://img.shields.io/github/issues/themalik-g/al-jin-whatsapp-bot)](https://github.com/themalik-g/al-jin-whatsapp-bot/issues)
[![Last commit](https://img.shields.io/github/last-commit/themalik-g/al-jin-whatsapp-bot)](https://github.com/themalik-g/al-jin-whatsapp-bot/commits/main)
[![Version](https://img.shields.io/badge/version-1.3.4-blue)](https://github.com/themalik-g/al-jin-whatsapp-bot)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7.0.0--rc.14-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

**⭐ If Al-Jin helps you, please star the repository — it helps others discover the project!**

**Al-Jin is a self-hosted WhatsApp MD bot** that links to your WhatsApp account through an 8-character **pairing code** ("Link with phone number instead") — no QR scan needed. It runs on your own server, stores everything locally, and gives you a full command suite for:

- **Recovering deleted and edited messages** (anti-delete / anti-edit)
- **Revealing view-once photos and videos**
- **Saving and auto-viewing WhatsApp statuses**
- **Downloading** YouTube, Instagram, TikTok and Facebook media
- **Chatting with Gemini AI** and running AI tools
- **Managing WhatsApp groups** (kick, promote, welcome messages, protection)
- **Islamic tools** (Quran, Hadith, prayer times)

It is built on the latest **Baileys v7.0.0-rc.14** with LID-aware JID resolution, so it keeps working with WhatsApp's newer identifier system.

> **Looking for a WhatsApp bot you can self-host?** Al-Jin runs on a VPS, Docker, PM2, Pterodactyl panels or Termux and keeps all data on your own machine.

**Keywords:** al-jin · al jin bot · aljin whatsapp bot · al-jin whatsapp bot · whatsapp bot · whatsapp md bot · whatsapp multi device bot · baileys bot · baileys v7 · whatsapp bot nodejs · whatsapp anti delete bot · view once reveal · whatsapp status saver · whatsapp youtube downloader · fulldp hddp · whatsapp gemini ai bot · whatsapp group management bot · multi session whatsapp bot · self-hosted whatsapp bot · pairing code login

## Table of Contents

- [What is Al-Jin?](#what-is-al-jin)
- [Why choose Al-Jin?](#why-choose-al-jin)
- [Standout Features](#standout-features)
- [Command Reference](#command-reference)
- [Quick Start](#quick-start)
- [Supported Platforms](#supported-platforms)
- [Documentation](#documentation)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Credits](#credits)

## What is Al-Jin?

**Al-Jin** is a self-hosted **WhatsApp MD bot** that links to your WhatsApp account through an 8-character **pairing code** — no QR scan needed. It runs on your own server, stores everything locally, and provides anti-delete recovery, view-once reveal, status saving, media downloading, Gemini AI tools, Islamic tools, and complete group administration.

It is built on the latest **Baileys v7.0.0-rc.14** with LID-aware JID resolution.

## Why choose Al-Jin?

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

## Standout Features

### Native Interactive Buttons
Quick-reply, single-select, URL and call buttons — supported natively on the latest Baileys protocol. **No custom fork, no broken listeners.** Switch between button UI and text UI anytime with `.replymode`.

### In-WhatsApp Multi-Session Pairing
Add another WhatsApp number **without leaving the chat**. Send `.addsession <number>` inside WhatsApp and follow the pairing code — no SSH, no terminal, no dashboard.

### FullDP & HDDP Profile Pictures
Fetch **full-resolution** and **HD** profile pictures of any user or group on the **standard Baileys library**, not a patched fork.

### YouTube Downloader With Zero Authentication
Download YouTube video and audio **without cookies**, **without a Google account** and **without OAuth**.

### Anti-Delete, Anti-Edit & View-Once Recovery
The Ghost and Peek modules capture deleted messages, edited messages and view-once media, then forward them to the owner chat.

### Latest Baileys
Built on **`@whiskeysockets/baileys` v7.0.0-rc.14**. Protocol fixes, button support and multi-device improvements land in Al-Jin fast.

## Command Reference

> Default prefix: `.` — change it with `.prefix <new_prefix>`

### System & General
| Command | Description |
|---------|-------------|
| `.alive` | Check bot is responsive with runtime stats |
| `.ping` | Measure bot response latency |
| `.uptime` | Show total active running time |
| `.restart` | Restart the current session worker |
| `.help` / `.menu` | Show full command list |
| `.usermanual` | Send the official Al-Jin PDF user manual |
| `.prefix` | View or change the command prefix |
| `.mode public\|private` | Toggle public / owner-only mode |
| `.replymode buttons\|text` | Switch between button UI and text UI |
| `.settings` | Overview of all toggles and modes |
| `.update` | Pull latest code from the repository |
| `.script` / `.repo` | Show repository details |
| `.owner` | Show bot owner contact card |

### Ghost — Anti-Delete / Anti-Edit
| Command | Description |
|---------|-------------|
| `.ghost` | Show current status and menu |
| `.ghost on\|off` | Toggle anti-delete watcher |
| `.ghost edit on\|off` | Toggle anti-edit watcher |

### Lurk — Status Watcher
| Command | Description |
|---------|-------------|
| `.lurk` | Status watcher menu |
| `.lurk on\|off` | Toggle status auto-view |
| `.lurk react on\|off` | Toggle status auto-reaction |
| `.lurk download on\|off` | Toggle status media download |
| `.lurk emoji <emoji>` | Set reaction emoji |

### Peek — View-Once Revealer
| Command | Description |
|---------|-------------|
| `.peek` | View peek settings |
| `.peek auto on\|off` | Auto view-once capture |
| `.peek watch on\|off` | Quoted view-once watcher |
| `.peek dest <jid>` | Set reveal destination |

### AI Tools
| Command | Description |
|---------|-------------|
| `.gemini <prompt>` | Google Gemini chat |
| `.photo <prompt>` / `.imagine` | Generate AI image via Gemini |
| `.scholar <query>` | University-professor style explanations |
| `.ppt <topic>` | AI-generated PowerPoint (.pptx) |
| `.quransearch <query>` | AI Quran verse search + explanation |
| `.hadeessearch <query>` | AI Hadith search + explanation |
| `.islamsearch <query>` | AI Quran + Hadith combined search |

### Islamic Tools
| Command | Description |
|---------|-------------|
| `.prayertimes <city>` / `.pts` | Daily prayer times worldwide |
| `.quran <verse>` | Verse lookup (Arabic + English) |
| `.search quran <keyword>` | Keyword search in Quran translation |
| `.sora <surah>` | Full Surah PDF (1–114) |
| `.para <1-30>` | Juz / Para PDF |
| `.bukhari <hadith>` | Sahih Bukhari Hadith |
| `.muslim <hadith>` | Sahih Muslim Hadith |

### Downloaders
| Command | Description |
|---------|-------------|
| `.play <query>` | YouTube / SoundCloud audio as MP3 |
| `.ytv <url>` / `.video` | YouTube video optimized for WhatsApp |
| `.ytdl <url>` | YouTube video download |
| `.mp3 <url>` | Audio download |
| `.ig <url>` | Instagram reel / post / story |
| `.tiktok <url>` | TikTok no-watermark |
| `.fb <url>` | Facebook video |
| `.twitter <url>` | Twitter/X video |

### Media Tools
| Command | Description |
|---------|-------------|
| `.sticker` | Image/video to sticker |
| `.toimg` | Sticker to image |
| `.tomp3` | Audio to MP3 |
| `.vn` | Voice note |
| `.trim` | Trim audio/video |
| `.compress` | Compress media |
| `.ocr` | Extract text from image |
| `.tts <text>` | Text to speech |

### Group Administration
| Command | Description |
|---------|-------------|
| `.open` / `.close` | Open / close group |
| `.kick @user` | Remove member |
| `.add <number>` | Add member |
| `.promote @user` | Promote to admin |
| `.demote @user` | Demote admin |
| `.tagall` | Tag all members |
| `.welcome on\|off` | Welcome messages |
| `.antilink on\|off` | Antilink protection |

### Owner & Session
| Command | Description |
|---------|-------------|
| `.setpp` | Set profile picture |
| `.setabout` | Set about text |
| `.getpair <number>` | Generate pairing code |
| `.addsession <number>` | Add another WhatsApp number |
| `.delsession <number>` | Remove session |
| `.addowner <number>` | Add owner |

### Privacy & Presence
| Command | Description |
|---------|-------------|
| `.presence` | Presence settings |
| `.presence alwaysonline on\|off` | Always online mode |
| `.presence autotyping on\|off` | Auto-typing mode |

### Monitoring & Tracking
| Command | Description |
|---------|-------------|
| `.stalk <number>` | User info |
| `.statusalert` | Status alert |
| `.watch` | Watch contact |
| `.schedule` | Schedule message |

### Utilities & Fun
| Command | Description |
|---------|-------------|
| `.currency` | Currency conversion |
| `.weather <city>` | Weather info |
| `.shorten <url>` | Shorten URL |
| `.speedtest` | Internet speed test |
| `.news` | Latest news |
| `.wiki <query>` | Wikipedia search |
| `.joke` | Random joke |
| `.movie <query>` | Movie info |
| `.lyrics <query>` | Song lyrics |

## Quick Start

**Requirements:** Node.js 20+, a WhatsApp account to link, and optionally PM2 for 24/7 uptime.

```bash
git clone https://github.com/themalik-g/al-jin-whatsapp-bot.git
cd al-jin-whatsapp-bot
npm install
npm start
