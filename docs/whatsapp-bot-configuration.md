# Configuration

## `config.js`

```javascript
export const CONFIG = {
    owner: "923257853673",              // WhatsApp phone number, digits only
    codename: "Al-Jin",                 // Shown in startup banner
    memoryTTL: 60 * 60 * 1000,          // Ledger message retention (1 hour)
    reconnectDelay: 3000,               // Auto-reconnect delay (ms)
    keepAliveInterval: 30_000           // Presence heartbeat interval (ms)
};
```

---

## Configuration & Session Management

Session state directories manage Baileys authentication state and connection credentials:
- `creds.json` — Signal protocol key credentials
- `app-state-sync-*.json` — App state sync files
- `lid-mapping-*.json` — LID ↔ PN local mappings

---

## Environment Variables

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Node environment |
| `WRAITH_DEBUG` | unset | Set to `1` for verbose trace logs |

Set `WRAITH_DEBUG=1` to enable verbose trace output:
- Ghost ledger storage events

Every WRAITH_* variable can also be set as AL_JIN_* (for example AL_JIN_DEBUG). The old WRAITH_* names still work.
- View-once extraction steps
- JID resolution paths
- Download execution logs

---

## PM2 Configuration (`ecosystem.config.cjs`)

Key settings:

- `autorestart: true` — restart process on unexpected termination
- `max_memory_restart: 500M` — restart if RAM exceeds 500 MB
- `max_restarts: 20` — cap retries to avoid continuous crash loops
- `kill_timeout: 5000` — graceful shutdown window

---

## Optional API keys (`keys.env` or `.setvar`)

Al-Jin runs without any key. Each key only makes a feature faster or unlocks an optional provider. Set them from WhatsApp as owner: `.setvar <KEY> <value>`; read with `.getvar <KEY>`.

| Key | Used by |
|---|---|
| `GROQ_API_KEY` | Fast AI chat and speech-to-text (`.bot`, `.jin`, `.trb`, `.trt`, `.subtitle`) |
| `GEMINI_API_KEY` | `.gemini`, `.scholar`, `.ppt` outlines, subtitle translation, fallbacks |
| `PUTER_TOKEN` | `.gpt`, `.claude`, `.grok`, `.deepseek`, `.kimi` |
| `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | Optional extra AI / speech providers |
| `BRIA_API_KEY`, `HF_TOKEN` | Optional image providers |
| `IG_SESSIONID` | Owner-only Instagram+ commands (`.igzip`, `.igstory`, `.igsearch`, `.igprofile`); use a spare account |

---

## Download and reply settings

| Setting | How to change | Default |
|---|---|---|
| Max size of one download | `.dlcap 800` / `.dlcap 1gb` (env `WRAITH_MAX_DOWNLOAD_MB`) | 500 MB, ceiling 2000 MB |
| Max video quality | `.dlcap quality 720` (env `WRAITH_VIDEO_HEIGHT`) | 480p |
| Send as document above | env `WRAITH_VIDEO_AS_DOC_MB` | 64 MB |
| Reply mode | `.replymode text\|poll\|buttons` (env `WRAITH_REPLY_MODE`) | text |
| Poll lifetime | env `AL_JIN_POLL_TTL_MS` | 60000 ms |
| APK size limit | env `APK_MAX_MB` (otherwise `.dlcap` applies) | `.dlcap` |

These limits apply to `.movie`, `.series`, `.dl`, `.ytv`, `.jindl`, `.apk` and other downloaders.
