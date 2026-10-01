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
  "description": "WRAITH is a free, open-source WhatsApp multi-device bot built on Baileys v7.0.0.14rc. Features interactive buttons, in-WhatsApp multi-session pairing, FullDP/HDDP profile picture support, anti-delete recovery, view-once reveal, cookie-free YouTube downloader, Gemini AI, and full group administration.",
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
  "keywords": "whatsapp bot, whatsapp md bot, baileys bot, baileys v7, interactive buttons whatsapp, anti-delete whatsapp, view-once reveal, status saver, whatsapp downloader, youtube downloader without cookies, fulldp whatsapp, hddp profile picture, gemini whatsapp bot, multi-session whatsapp, self-hosted whatsapp bot",
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
      "name": "Does WRAITH support interactive WhatsApp buttons?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. WRAITH supports native interactive buttons (quick-reply, single-select, URL, call) via the latest Baileys protocol, without requiring a custom fork."
      }
    },
    {
      "@type": "Question",
      "name": "Can I pair a new WhatsApp session without leaving the chat?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Unlike other bots that require you to run terminal commands, WRAITH lets you pair additional numbers directly inside WhatsApp using a bot command. No terminal or dashboard needed."
      }
    },
    {
      "@type": "Question",
      "name": "Does WRAITH support FullDP and HDDP profile pictures?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. WRAITH fetches full-resolution and HD profile pictures on the standard Baileys library without any custom fork or patched build."
      }
    },
    {
      "@type": "Question",
      "name": "Does the YouTube downloader require cookies or a Google account?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. WRAITH's YouTube downloader works without cookies, without a Google account, and without any authentication — unlike most bots that broke after YouTube's 2024 restrictions."
      }
    },
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
      "name": "Which Baileys version does WRAITH use?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "WRAITH runs on Baileys v7.0.0.14rc, the latest release-candidate line of the multi-device library."
      }
    },
    {
      "@type": "Question",
      "name": "Is WRAITH free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. WRAITH is MIT-licensed and free to use, modify, and distribute."
      }
    }
  ]
}
</script>
-->

# WRAITH — WhatsApp MD Bot (Baileys v7.0.0.14rc)

**WRAITH is a free, open-source WhatsApp multi-device (MD) bot** built on the 
latest **Baileys v7.0.0.14rc** and Node.js 20+. It ships **interactive 
buttons**, **in-WhatsApp multi-session pairing**, **FullDP / HDDP profile 
pictures** on a standard (non-forked) Baileys build, **anti-delete message 
recovery**, **view-once reveal**, **cookie-free YouTube downloader**, 
**Google Gemini AI**, and full **group administration** — all without needing 
a browser, QR scan, or WhatsApp Business API.

<div align="center">

[![Version](https://img.shields.io/badge/version-1.3.3-blue)](https://github.com/themalik-g/wraith)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-v7.0.0.14rc-green)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

**Keywords:** whatsapp bot · whatsapp md bot · baileys bot · interactive buttons · 
anti-delete · view-once reveal · status saver · youtube downloader · 
fulldp hddp · gemini bot · multi-session whatsapp · self-hosted

</div>

---

## 📖 Table of Contents

- [What is WRAITH?](#what-is-wraith)
- [Standout Features (Why WRAITH?)](#-standout-features-why-wraith)
- [Full Feature List](#-full-feature-list)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [FAQ](#-faq)
- [Quick Troubleshooting](#-quick-troubleshooting)
- [Security](#-security)
- [License](#-license)
- [Credits](#-credits)

---

## What is WRAITH?

**WRAITH** is a free, open-source **WhatsApp bot** for Node.js built on the 
latest **[Baileys v7.0.0.14rc](https://github.com/WhiskeySockets/Baileys)** 
(multi-device, no browser needed). It quietly watches your account and gives 
you **anti-delete / anti-edit message recovery**, **view-once media reveal**, 
**status auto-view & download**, **scheduled messages**, a **cookie-free 
YouTube / Instagram / TikTok downloader**, **interactive button replies**, 
**AI (Gemini) tools**, and full **group administration** — all with LID-aware 
JID resolution.

> **Keywords:** WhatsApp bot · WhatsApp anti-delete · view-once downloader · 
> WhatsApp status saver · YouTube downloader without cookies · Baileys v7 bot · 
> interactive buttons WhatsApp · FullDP HDDP bot · multi-session WhatsApp bot · 
> Gemini WhatsApp bot · self-hosted WhatsApp automation

---

## 🌟 Standout Features (Why WRAITH?)

These are the things you **won't easily find** in other Baileys bots.

### 🔘 Native Interactive Buttons
Quick-reply, single-select, URL, and call buttons — supported natively on the 
latest Baileys protocol. No custom fork, no hacks, no broken listeners.

### 🧩 In-WhatsApp Multi-Session Pairing
Add another WhatsApp number **without ever leaving the chat**. Just send a 
command inside WhatsApp and follow the pairing code — no SSH, no terminal, 
no dashboard, no "add session" web panel. Run several numbers from one 
install, each with its own isolated session folder.

### 🖼️ FullDP & HDDP Profile Pictures
Fetch **full-resolution** and **HD** profile pictures of any user or group — 
on the **standard Baileys library**, not a patched fork. Most bots that 
support HDDP rely on custom builds; WRAITH doesn't need one.

### 🎬 YouTube Downloader With **Zero** Authentication
Download YouTube video and audio **without cookies**, **without a Google 
account**, and **without any OAuth flow**. This is the biggest pain point 
for most bots after Google's 2024 anti-bot changes — WRAITH simply works.

### 📡 Always on the Latest Baileys
Built on **`@whiskeysockets/baileys v7.0.0.14rc`** — the newest release-candidate 
line. New protocol fixes, button support, and multi-device improvements land 
in WRAITH fast.

---

## ✨ Full Feature List

| Module | What it does |
|---|---|
| **Ghost** | Anti-delete, anti-edit and secret-edit tracking. Deleted or edited messages (with media) are sent back to the owner. |
| **Peek** | Reveals view-once images, videos and audio, with auto-peek and quoted-message detection. |
| **Lurk** | Auto-view statuses, auto-react with custom or random emojis, silently save status media to your DM. |
| **Schedule** | Schedule any message, or group open/close, for a future time, with retries and owner notices. |
| **⬇️ Downloader** | `.dl` `.play` `.ytv` `.video` `.ytdl` `.mp3` `.pdl` `.pdlzip`: YouTube video/audio (up to 400 MB, **no cookies required**) and image carousels from Instagram, TikTok, Pinterest, Twitter and Facebook via `@postfetch/core` + `yt-dlp`. |
| **File & Social** | GitHub repo (`.gitdl`), MediaFire (`.mfdl`), profile search and media (`.ig` `.tiktok` `.fb`), songs (`.song`). |
| **AI & Media** | Gemini assistant (`.gemini`), AI photos (`.photo`), PowerPoint generator (`.ppt`), 54 Ephoto360 text effects (`.textmaker`), book search, stock images, lyrics, movies, couple PPs. |
| **Interactive UI** | Native reply buttons on menus, confirmations, and command outputs. |
| **Admin & Group** | `.open` `.close` `.kick` `.add` `.promote` `.demote` `.approveall` `.kickall` `.tagall` `.hidetag` `.welcome` `.goodbye` plus `.antilink` `.antispam` `.antisticker` `.rejectcalls`. |
| **Multi-Session** | Add, list, and manage additional WhatsApp numbers from inside WhatsApp with a command — no terminal needed. |
| **Profile Tools** | FullDP / HDDP fetcher, `.setpp`, `.setabout`, `.setstatus`, `.stalk`, `.getpair`. |
| **Owner & Profile** | Multi-owner, block list, `.setsession`, `.mode public/private`, `.prefix`. |
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

### Adding another number — without leaving WhatsApp
Once the bot is running, just send the multi-session command inside any 
WhatsApp chat. WRAITH walks you through pairing the new number with an 
8-character code. No terminal, no re-deploy.

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

**Does WRAITH support interactive WhatsApp buttons?**
Yes. Quick-reply, single-select, URL, and call buttons work natively on the 
latest Baileys protocol. No custom fork required.

**Can I pair a new WhatsApp session without leaving the chat?**
Yes. WRAITH lets you add additional numbers directly inside WhatsApp using a 
bot command — no terminal, no dashboard.

**Does WRAITH support FullDP and HDDP profile pictures?**
Yes. Full-resolution and HD profile pictures are fetched on the standard 
Baileys library — no patched build needed.

**Does the YouTube downloader require cookies or a Google account?**
No. It works without cookies, without a Google account, and without any 
authentication.

**Can WRAITH recover deleted WhatsApp messages?**
Yes. The Ghost module logs messages and sends deleted or edited ones back 
to the owner.

**Does it need a QR code?**
No. It links with an 8-character pairing code via "Link with phone number instead".

**Which Baileys version does WRAITH use?**
`@whiskeysockets/baileys` **v7.0.0.14rc** — the latest release-candidate line.

**Can I run multiple numbers?**
Yes. Multi-session is built in, and you can add numbers from within WhatsApp.

**Which Node.js version?**
Node.js 20 or newer.

**Is it safe for my account?**
WRAITH uses the official multi-device protocol through Baileys, but any 
unofficial client carries some risk. Use responsibly and avoid spam.

---

## Quick Troubleshooting

| Problem | Fix |
|---|---|
| "Waiting for this message" | Update to v1.3.3; see Troubleshooting doc |
| Bot won't pair | Delete `session/`, restart, re-enter number |
| `internal-server-error` on admin | Bot must be admin; resolve target PN first |
| Buttons not rendering | Update to latest WRAITH; some clients cache |
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

- Built on [Baileys](https://github.com/WhiskeySockets/Baileys) v7.0.0.14rc
- Downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and 
  [@postfetch/core](https://github.com/postfetch/core)
- Repository: [themalik-g/wraith](https://github.com/themalik-g/wraith)

---

<div align="center">

**⭐ If WRAITH helped you, consider giving it a star on GitHub! ⭐**

</div>
