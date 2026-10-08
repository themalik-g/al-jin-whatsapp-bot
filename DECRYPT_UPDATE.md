# Combined update — "Waiting for this message" on the bot's own phone

Copy over the same paths and restart (no new packages, session NOT touched, do NOT delete it):
- start.js              (AI's history-sync callback + 5 fixes below)
- modules/update.js     (flushes creds before the restart)
- lib/own-warmup.js     (new)

## What changed in start.js
1. shouldSyncHistoryMessage added (the suggested fix; allows everything except FULL history).
2. creds are saved before the socket is torn down on reconnect, on SIGINT/SIGTERM and before .update restarts
   (the creds.update listener used to be removed first, so late changes were lost → stale prekey counters on next boot).
3. Own-phone warm-up on every connect, BEFORE the first message is sent: stores our LID↔PN pair and creates
   sessions with the account's other devices (rebuilt once per process, only missing ones on later reconnects;
   WRAITH_FORCE_OWN_SESSIONS=1 forces a rebuild every time).
4. Startup "connected ✅" + contact card go out once per process (not on every reconnect) to the device-less own JID.
5. Boot log now says whether the LID/PN Baileys patch is really applied.

## Checks (run on the server)
  grep -n "shouldSyncHistoryMessage" node_modules/@whiskeysockets/baileys/lib/Defaults/index.js
  ls session | grep -c lid-mapping        # > 0 → mappings ARE persisted
  boot log line:  "baileys <version> · LID/PN retry patch applied"  (or NOT applied)

## A/B test
After a restart, when messages from the bot show "Waiting for this message" on the phone, send ANY command from
the phone (e.g. .ping) instead of .update. If that fixes it too, the cause is "no message received from the phone
yet", and the warm-up above is aimed at exactly that.

Fallbacks that already exist:  .fixkeys   /   .fixkeys all
