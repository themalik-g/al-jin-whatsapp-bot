# Al-Jin — Cody-inspired batch 1 (no new dependencies)

## New files
- `modules/x-guard.js`   — muteuser / unmuteuser / mutelist / mutesticker / unmutesticker / antiforward / dnd,
                           the `guardMessage()` hook and the shared `enforce()` punishment ladder
- `modules/x-effects.js` — echo, reverb, nightcore, chipmunk, slowed, deep, drunk, fast, tremolo, distort, fx
- `lib/guard-core.js`    — pure helpers (durations, strikes, forward detection, mute matching)
- `lib/audio-effects.js` — the ffmpeg filter chains
- `test/x-guard.test.js` — 22 offline tests (mock socket; ffmpeg tests skip if ffmpeg is missing)

## Changed files
- `modules/x-hooks.js`   — calls `guardMessage()` for every group message; antiword + antitag now use `enforce()`
- `modules/x-group.js`   — `.antiword action …` and new `.antitag action|limit …` use the shared ladder
- `modules/x-registry.js`— new verbs + `guard` / `effects` loaders
- `modules/x-details.js` — menu + `.details` entries, new "VOICE EFFECTS" menu section
- `docs/whatsapp-bot-commands.md` — documentation

## Behaviour change to know about
Old `.antiword action kick` meant "strikes, then kick". In the new ladder that is `warn`;
`kick` now means kick immediately. Existing saved antiword settings are migrated automatically
(old "kick" → "warn") the first time they are used, so nothing changes for current groups.

## Notes
- Admins and bot owners are exempt from every guard feature.
- The bot must be a group admin to delete messages / remove members (it tells you when it isn't).
- Temp-kick returns are saved in `state/x-guard.json` and survive restarts.
  Re-adding can fail if the person's privacy settings block it — the bot then says so.
- Mutes, banned stickers, antiforward and dnd are stored per group in `state/x-group.json`.

## Test
    node --test test/x-guard.test.js test/x-extras.test.js
