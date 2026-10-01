<!--
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "WRAITH",
  "alternateName": ["Wraith MD Bot", "Wraith WhatsApp Bot", "Wraith-MD"],
  "applicationCategory": "CommunicationApplication",
  "applicationSubCategory": "WhatsApp Bot",
  "operatingSystem": "Node.js 20+",
  "description": "WRAITH is a free, open-source WhatsApp multi-device bot built on Baileys v7. It offers anti-delete message recovery, view-once media reveal, status saver, YouTube/Instagram/TikTok downloader, Google Gemini AI integration, and full group administration.",
  "url": "https://github.com/themalik-g/wraith",
  "downloadUrl": "https://github.com/themalik-g/wraith/archive/refs/heads/main.zip",
  "codeRepository": "https://github.com/themalik-g/wraith",
  "author": {
    "@type": "Person",
    "name": "MALIK MEHTAB",
    "url": "https://github.com/themalik-g"
  },
  "publisher": {
    "@type": "Organization",
    "name": "WRAITH",
    "url": "https://github.com/themalik-g/wraith"
  },
  "license": "https://opensource.org/licenses/MIT",
  "softwareVersion": "1.3.3",
  "programmingLanguage": "JavaScript",
  "runtimePlatform": "Node.js",
  "keywords": "whatsapp bot, whatsapp md bot, baileys bot, anti-delete whatsapp, view-once reveal, status saver, whatsapp downloader, gemini whatsapp bot, open source whatsapp bot, self-hosted whatsapp bot",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
-->

<!--
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Can WRAITH recover deleted WhatsApp messages?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. The Ghost module logs messages before deletion and sends the original content back to the bot owner when a deletion is detected."
      }
    },
    {
      "@type": "Question",
      "name": "Does WRAITH need a QR code to log in?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. WRAITH links with an 8-character pairing code entered into WhatsApp's 'Link with phone number instead' screen."
      }
    },
    {
      "@type": "Question",
      "name": "Is WRAITH free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. WRAITH is MIT-licensed and free to use, modify, and distribute."
      }
    },
    {
      "@type": "Question",
      "name": "Does WRAITH support Gemini AI?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, via an optional Google Gemini API key. Without a key, AI commands are disabled but the rest of the bot works normally."
      }
    },
    {
      "@type": "Question",
      "name": "Can WRAITH run 24/7?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. WRAITH can be deployed on a VPS, Docker, PM2, or Pterodactyl for 24/7 uptime."
      }
    }
  ]
}
</script>
-->

# WRAITH — WhatsApp MD Bot (Baileys v7)

**WRAITH is a free, open-source WhatsApp multi-device (MD) bot** built on 
Baileys v7 and Node.js 20+. It provides **anti-delete message recovery**, 
**view-once media reveal**, **status auto-view and auto-save**, **YouTube / 
Instagram / TikTok downloader**, **Google Gemini AI** tools, and full 
**group administration** — all without needing a browser, QR code, or 
WhatsApp Business API.

<div align="center">

[![Version](https://img.shields.io/badge/version-1.3.3-blue)](https://github.com/themalik-g/wraith)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

**Keywords:** whatsapp bot · whatsapp md bot · baileys bot · anti-delete · 
view-once reveal · status saver · whatsapp downloader · gemini bot · 
self-hosted whatsapp bot

</div>

---

## 📖 Table of Contents

- [What is WRAITH?](#what-is-wraith)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [FAQ](#-faq)
- [Troubleshooting](#-quick-troubleshooting)
- [Security](#-security)
- [License](#-license)
- [Credits](#-credits)

---

## What is WRAITH?

**WRAITH** is a free, open-source **WhatsApp bot** for Node.js built on 
**[Baileys v7](https://github.com/WhiskeySockets/Baileys)** (multi-device, 
no browser needed). It quietly watches your account and gives you 
**anti-delete / anti-edit message recovery**, **view-once media reveal**, 
**status auto-view & download**, **scheduled messages**, a **YouTube / 
Instagram / TikTok downloader**, **AI (Gemini) tools**, and full **group 
administration**, all with LID-aware JID resolution.

> **Keywords:** WhatsApp bot · WhatsApp anti-delete · view-once downloader · 
> WhatsApp status saver · WhatsApp YouTube downloader · Baileys bot · 
> multi-device WhatsApp bot · Node.js WhatsApp automation · Gemini WhatsApp 
> bot · WhatsApp group manager

### ⚡ At a glance

| **Type** | WhatsApp userbot / automation bot (linked device) |
|---|---|
| **Language / Runtime** | JavaScript (ESM) · Node.js ≥ 20 |
| **WhatsApp library** | `@whiskeysockets/baileys` v7 |
| **Login method** | Pairing code (no QR needed) |
| **Multi-session** | Yes, run several numbers from one install |
| **Deploy targets** | VPS · PM2 · Docker · Pterodactyl panels |
| **License** | MIT |
| **Repository** | [https://github.com/themalik-g/wraith](https://github.com/themalik-g/wraith) |

---

## ✨ Features

| Module | What it does |
|---|---|
| **Ghost** | Anti-delete, anti-edit and secret-edit tracking. Deleted or edited messages (with media) are sent back to the owner. |
| **Peek** | Reveals view-once images, videos and audio, with auto-peek and quoted-message detection. |
| **Lurk** | Auto-view statuses, auto-react with custom or random emojis, silently save status media to your DM. |
| **Schedule** | Schedule any message, or group open/close, for a future time, with retries and owner notices. |
| **⬇️ Downloader** | `.dl` `.play` `.ytv` `.video` `.ytdl` `.mp3` `.pdl` `.pdlzip`: YouTube video/audio (up to 400 MB) and image carousels from Instagram, TikTok, Pinterest, Twitter and Facebook via `@postfetch/core` + `yt-dlp`. |
| **File & Social** | GitHub repo (`.gitdl`), MediaFire (`.mfdl`), profile search and media (`.ig` `.tiktok` `.fb`), songs (`.song`). |
| **AI & Media** | Gemini assistant (`.gemini`), AI photos (`.photo`), PowerPoint generator (`.ppt`), 54 Ephoto360 text effects (`.textmaker`), book search, stock images, lyrics, movies, couple PPs. |
| **Admin & Group** | `.open` `.close` `.kick` `.add` `.promote` `.demote` `.approveall` `.kickall` `.tagall` `.hidetag` `.welcome` `.goodbye` plus `.antilink` `.antispam` `.antisticker` `.rejectcalls`. |
| **Owner & Profile** | Multi-owner, block list, `.setstatus`, `.getpair`, `.setsession`, `.setpp`, `.setabout`, `.stalk`, `.mode public/private`, `.prefix`. |
| **Utilities** | Weather, currency, dictionary, QR generate/decode, URL upload/shorten, news, Wikipedia, password-breach check, jokes, facts. |
| **JID tools** | PN ⇄ LID resolver, channel list, group roster with admin roles, profile picture fetcher. |
| **⚙️ Presence** | Always online, auto-typing, auto-recording, read-receipt control. |
| **Activity & Ping** | Chat activity dashboard and latency/memory probe. |
| **User Manual** | `.usermanual` sends the full manual as a WhatsApp PDF. |

---

## Quick Start

**Requirements:** Node.js 20+, a WhatsApp account to link, optional PM2 for 24/7 uptime.

```bash
git clone https://github.com/themalik-g/wraith.git
cd wraith
npm install
npm start
```

On first run, WRAITH prints an 8-character pairing code. Enter it in 
WhatsApp → **Linked Devices → Link with phone number instead**.

To add another number:

```bash
node start.js --add
```

Each number gets its own isolated `instances//` folder.

---

## Documentation

| File | Topic |
|---|---|
| [whatsapp-bot-commands.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-commands.md) | Every command with examples |
| [whatsapp-bot-configuration.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-configuration.md) | Settings, state files, variables |
| [whatsapp-jid-system.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-jid-system.md) | PN, LID and JID resolution |
| [whatsapp-bot-deployment.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-deployment.md) | VPS, Docker, PM2, panels |
| [whatsapp-bot-troubleshooting.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-troubleshooting.md) | Common errors and fixes |
| [whatsapp-bot-architecture.md](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-architecture.md) | Module design and router flow |

---

## ❓ FAQ

**How do I stop "Waiting for this message. This may take a while"?**
Update to v1.3.3. Messages are now stored persistently so WhatsApp retry requests succeed. If old sessions are corrupted, delete `session-*.json` and `sender-key-*.json` in `instances//session/` (keep `creds.json`). See [Troubleshooting](https://github.com/themalik-g/wraith/blob/main/docs/whatsapp-bot-troubleshooting.md).

**Can WRAITH recover deleted WhatsApp messages?**
Yes. The Ghost module logs messages and sends deleted or edited ones back to the owner.

**Does it need a QR code?**
No. It links with a pairing code via "Link with phone number instead".

**Can I run multiple numbers?**
Yes. Use `node start.js --add`; each number gets its own isolated `instances//` folder.

**Is it safe for my account?**
WRAITH uses the official multi-device protocol through Baileys, but any unofficial client carries some risk. Use it responsibly and avoid spam.

**Which Node.js version?**
Node.js 20 or newer.

---

## Quick troubleshooting

| Problem | Fix |
|---|---|
| "Waiting for this message" | Update to v1.3.3, see FAQ above |
| Bot won't pair | Delete `session/`, restart, re-enter number |
| `internal-server-error` on admin | Bot must be admin; resolve target PN first |
| Image post download failed | Use `.pdl` or `.pdlzip` |
| LID not resolving | Reply to their message in a group first |

---

## Security

Never commit `instances/`, `session/`, `.env`, `keys.env` or `creds.json`. 
Rotate API keys if they were ever pushed.

---

## ⚠️ Disclaimer

WRAITH is not affiliated with or endorsed by WhatsApp or Meta. Use at your 
own risk and respect privacy laws and WhatsApp's Terms of Service.

---

## Contributing

Issues and PRs are welcome. Run `node --check` on changed files and the 
tests in `/test` before opening a PR.

---

## Support

Open an [issue](https://github.com/themalik-g/wraith/issues) or message the 
owner via the in-bot `.owner` contact.

---

## License

[MIT](https://github.com/themalik-g/wraith/blob/main/LICENSE) © MALIK MEHTAB

---

## Credits

- Built on [Baileys](https://github.com/WhiskeySockets/Baileys)
- Downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and 
  [@postfetch/core](https://github.com/postfetch/core)
- Repository: [themalik-g/wraith](https://github.com/themalik-g/wraith)

---

<div align="center">

**⭐ If WRAITH helped you, consider giving it a star on GitHub! ⭐**

</div>
