# Auto subtitles — `.subtitle`

Reply to a video with `.subtitle` and the bot transcribes the speech and burns the subtitles into the video.

| Command | Result |
|---|---|
| `.subtitle` | YouTube-style subtitles (white text, soft box) |
| `.subtitle netflix` | Clean bold white text with a soft shadow |
| `.subtitle bold` | Large yellow text with a thick outline |
| `.subtitle ur` | Force the spoken language (2-letter code: en, ur, hi, ar …) |
| `.subtitle srt` | Only the `.srt` file — no re-encoding, lightest option |

Aliases: `.subtitles`, `.subs`, `.sub`, `.addsub`. Styles and a language can be combined: `.subtitle bold ur`.

## One-time setup (free keys — add at least one)

```
.setvar GROQ_API_KEY <key>       # console.groq.com        (fastest, tried first)
.setvar GEMINI_API_KEY <key>     # aistudio.google.com/apikey
.setvar DEEPGRAM_API_KEY <key>   # console.deepgram.com
.setvar OPENAI_API_KEY <key>     # optional, paid, last resort
```

The bot tries them in that order and moves on automatically when one is rate-limited or down.
Optional: `.setvar SUBTITLE_MAX_MINUTES 30` (default 15, max 60).

## How it stays light

* No new npm packages — plain `fetch` for the speech APIs, the ffmpeg the bot already has for audio and burning.
* The video is streamed to disk (never held in RAM), output is capped at 1280 px on the long side, one job runs at a time (max 3 waiting).
* Every temporary file is deleted when the job ends, even on failure.
* If the ffmpeg build has no subtitle renderer (libass), the bot sends the `.srt` file instead.

## Fonts

`fonts/DejaVuSans-Bold.ttf` is bundled (Latin, Cyrillic, Greek, Arabic/Urdu, Hebrew). For other scripts
(Hindi, Chinese, Thai …) drop a matching `.ttf` / `.otf` into `fonts/` — every font in that folder is available to the renderer.
