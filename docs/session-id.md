# Session ID

A **Session ID** (`JIN_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`) is a key to your saved WhatsApp login. Link once on the Jin pairing site, then start the bot anywhere with the ID instead of pairing again.

## Use it
Any ONE of these (first found wins): `node index.js --session-id=JIN_...` → `SESSION_ID` variable (panel, `.env`, Docker `-e`) → `const SESSION_ID` at the top of `index.js`.
`SESSION_API` is the address of your session store (your Cloudflare Worker). Launchers downloaded from the pairing site have both filled in.

## What happens on start
1. If `instances/main/session/creds.json` already came from this same ID, it is used as is.
2. Otherwise the login is downloaded from the store. An older, different login is moved to `session.old-<time>`, never mixed.
3. If the store cannot be reached the bot says why and falls back to the normal pairing flow.
4. While running, refreshed login data is uploaded back at most every 10 minutes (so hosts that wipe their disk still return with fresh data). Turn off with `SESSION_SYNC=off`.

## Rules
- **One Session ID = one running bot.** Starting the same ID in two places makes WhatsApp disconnect one of them.
- Treat the ID like a password: anyone who has it can control the linked account. If it leaks, open WhatsApp → Linked devices and log that device out.
- Fresh IDs can take up to a minute to be readable from every region (Cloudflare KV is eventually consistent). "Not found" right after linking → wait a minute.

## Owner setup (once)
1. Deploy the session store + pairing site → see the `jin-pairing` README (Steps 1–3). You end up with two addresses: the **pairing site** and the **Worker** (session store).
2. In your GitHub project run: `node scripts/set-session-urls.js https://YOUR-SITE https://YOUR-WORKER`
   It fills in: `README.md` (button link), `index.js` (`SESSION_API`) and `lib/session-id.js` (`DEFAULT_API`).
3. Commit + push those files and `assets/get-session-id.svg`. Users now only need their `SESSION_ID`.


## Use a Session ID from chat (no number, no pairing code)
Owner commands accept a Session ID wherever they would ask for a phone number:

- `.setsession JIN_xxxx` – creates a new session from the saved login and starts it (a creds.json file is not needed). Optionally add the owner number: `.setsession 923001234567 JIN_xxxx`.
- `.addsession JIN_xxxx` – same, from `.addsession`.
- `.kb <api>,<server id>,JIN_xxxx` (`.kbstart` on Lite) – deploys Al-Jin Lite on KataBump with the Session ID; the bot logs in directly, no pairing code. With a number instead, you get a pairing code as before.

Notes: the bot deletes your message when WhatsApp allows it (the ID is a secret). It needs the store address, so set `SESSION_API` (variable, or at the top of `index.js`). `.kb` checks the Session ID **before** touching your server. A login that already runs as another session is refused.
