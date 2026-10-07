# Auto subtitles — `.subtitle`

Reply to a video with `.subtitle` and the bot transcribes the speech and burns the subtitles into the video.

| Command | Result |
|---|---|
| `.subtitle` | YouTube style, font F1 |
| `.subtitle netflix F2` | Style + font (any order) |
| `.subtitle neon F3 top big` | Style, font, position (`top` `mid` `bottom`) and size (`small` `big`) |
| `.subtitle ur` | Force the spoken language (2-letter code: en, ur, hi, ar …) |
| `.subtitle srt` | Only the `.srt` file — no re-encoding, lightest option |
| `.subtitle fonts` | Lists all styles and fonts |

Aliases: `.subtitles`, `.subs`, `.sub`, `.addsub`.

**Styles:** `youtube` · `netflix` · `bold` · `neon` · `redbox` · `gold` · `comic` (meme) · `minimal`

**Fonts** (all bundled in `fonts/`): F1 DejaVu Sans (default, Arabic/Urdu) · F2 Poppins · F3 Liberation Sans (Arial look) · F4 Liberation Serif (Times look) · F5 Carlito (Calibri look) · F6 Caladea (Cambria look) · F7 DejaVu Condensed (Arabic/Urdu) · F8 Liberation Mono

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

The eight fonts above are bundled (~3 MB). Whatever font you pick, Urdu/Arabic letters automatically fall back to DejaVu so mixed text still renders.
For other scripts (Hindi, Chinese, Thai …) drop a matching `.ttf` / `.otf` into `fonts/` — it is used as a glyph fallback automatically.
