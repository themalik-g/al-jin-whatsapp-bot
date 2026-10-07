# Update 4 — subtitles (Roman Urdu, .st) + "Waiting for this message" fix

## Subtitles
- `.st` alias (+ `.ssubtitle`); options in any order; missing options use defaults
  (detected language, youtube, F1, lower, small). See SUBTITLES.md.
- Urdu/Hindi speech → Roman Urdu subtitles (no more boxes). `.st ur` on other languages translates to Roman Urdu.
- Urdu-script text always uses an Arabic-capable font, whatever font (F2–F8) was picked.

## Own phone shows "Waiting for this message…"
Cause: stale signal sessions between the bot and your main phone. Fix = delete only those sessions; Baileys makes new ones.
- Chat:   `.fixkeys`        (owner; add `all` if needed) → bot restarts by itself, stays logged in.
- Manual: create the file  instances/main/state/repair-sessions.flag  containing `own` (or `all`), then restart the bot.
- Manual, brute force: stop bot, delete every file in instances/main/session/ EXCEPT creds.json, `pre-key-*` and `app-state-sync-*`, start bot.
Do NOT delete creds.json (that logs the bot out) or pre-keys (new chats would fail to decrypt).
Diagnose: set WRAITH_LOG_LEVEL=warn and look for "failed to decrypt" / "Bad MAC" lines.
