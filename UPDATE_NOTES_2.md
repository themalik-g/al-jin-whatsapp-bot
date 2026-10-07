# Al-Jin micro update 2 — Twitter fix, aliases, undefined-name sweep

## Fixed
- `.tw` / `.twitter` / `.pinterest` / `.threads` / `.reddit` / `.dl` error paths: "edit is not defined".
  `modules/download.js` called `edit()` and `react()` in 10 places but never defined them (old bug,
  so any failure inside the generic downloader crashed instead of reporting). Added both helpers.
- `.forward` could never load: `modules/forward.js` imported `resolveJid` from jid-resolver, which doesn't export it. Added a local resolver (JID or phone number).
- `.commandcount` was broken: `REGISTRY` wasn't exported from `modules/help.js`.
- `.tagallnoadmin` and `.hidetagnoadmin` were in the menu/router but had no handlers → written in `modules/group.js`.
- `modules/lurk.js`: undefined `sender` in a debug log → `bestSender`.

## New aliases
- `.insta`, `.instagram` → same as `.ig`
- `.yt <query/url>` (also `.youtube`) → video, uses the .ytv engine (honours `.dlcap`)
- `.yta <query/url>` → audio, uses the .play engine

## Sweep result
Checked every file for undefined names, bad imports/exports and every router handler:
203 handler references resolve; nothing else undefined.
Known leftovers (harmless, not changed): `noaction.js` in the repo root is an unused copy with broken
import paths (the real one is `modules/noaction.js`) — you can delete it.
