# Al-Jin micro update — manual-deploy fixes + bigger downloads

## How to apply
Copy these files over the same paths in your project (keep the folder structure), then run:
    npm start        (or  node index.js — both now behave the same)
Do NOT overwrite your existing `.env`; open it and follow "Fix your .env" below.

## 1. Alerts still going to the old owner (anti-edit / anti-delete / view-once)
Cause: `index.js` started the bot with its data in `instances/main/…`, but `npm start`
/ `node start.js` used the repo root (`./state/owner.json`). The shipped root
`state/owner.json` still held the old owner's number, so editing the other
owner.json changed nothing.
Fix: `core/bootstrap-env.js` (new, first import of start.js) makes every launch method
use the same data folder (old root-based installs that already have a session in the
root keep working). On startup the console now prints the data folder and
"alerts to: +number", and warns when the owner is not the linked account.
New command (primary owner / the linked account): `.setowner <number>` or `.setowner me`.
If no owner is set at all, the bot now uses its own linked number.

## 2. Hidden developer access removed (default)
`core/identity.js` used to treat one hard-coded number as owner of EVERY bot.
Now it is off. To keep it on your own deployment only: set `WRAITH_DEV_ACCESS=<digits>`.

## 3. Fix your .env  (the bug that bites on a laptop)
Old `.env` had your number in WRAITH_PHONE and three duplicate
`WRAITH_PROMPT_TIMEOUT_MS=… # comment` lines. The comment turned the value into NaN,
so the terminal "type your number" prompt timed out instantly and auto-paired YOUR number.
Fixed in code (comments are stripped, bad values fall back to 20 s). In the .env you
actually run: empty `WRAITH_PHONE=` (or use your own number) and delete the 3
PROMPT_TIMEOUT lines. `.env.example` is the clean template.

## 4. Bigger downloads
New owner command `.dlcap`:
    .dlcap              show limits
    .dlcap 1gb          set max size per download (5 MB … 2000 MB)
    .dlcap reset        back to 500 MB (new default; was 400 MB for YouTube, 100 MB elsewhere)
    .dlcap quality 720  highest video height (default 480p) — bigger quality = bigger files
Applies to .play / .ytv / .video / .ytdl, .dl / .yt / .mp3, .fb, .apk, .jindl / .jinvideo / .jinapk,
.gitdl, .mfdl. Also settable with env `WRAITH_MAX_DOWNLOAD_MB`.
- Big files stream from disk instead of loading into RAM.
- Files over 64 MB (`WRAITH_VIDEO_AS_DOC_MB`) are sent as documents — reliable up to WhatsApp's 2 GB.
- yt-dlp skips files it knows are over the cap *before* downloading.
- `.dl`'s hard 2-minute timeout now scales with the cap.
- Limits: needs free disk (~2× file size) and upload speed; a 1 GB upload on home internet is slow.
- Not changed on purpose: `.pdl`/post carousels (buffer-based), `.igzip`, `.book`, `.schedule` media.
