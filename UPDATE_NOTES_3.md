# Update 3 — lite features + CPU/RAM limits

NEW      core/limiter.js  lib/poll.js  lib/sysinfo.js  lib/fakequote.js  modules/limits.js
CHANGED  router.js  start.js  core/settings.js  lib/buttons.js  modules/help.js  modules/details.js
         modules/ping.js  modules/forward.js  modules/location.js  modules/media.js  .env.example
No new npm packages. Restart the bot after copying.

## Commands (all owner-only)
.replymode text|poll|buttons   poll = multi-select poll, every newly ticked option runs
.imenu on|off|preview          menu banner: caption / none / large preview card (default: on)
.cpu .gpu .ram .rom            system info (container-aware)
.cpulimit 0.30 | 30% | auto | off
.ramlimit 512 | 1gb [restart] | off

## How .cpulimit works
A CPU-seconds bucket refills at <limit> cores/s. The bot's own CPU plus every child process
(ffmpeg, yt-dlp, …) is deducted. In debt → children get SIGSTOP and new commands wait;
debt repaid → SIGCONT. Jobs take longer, average stays at the limit. Linux = full feature set;
other OS = bot itself gated, children only get lower priority. Startup/pairing is not throttled.
Jobs with a hard timeout may time out sooner under a very low limit.

## How .ramlimit works
Bot + child RSS vs ceiling: 75% trim caches + GC, 90% new commands wait, 100% kill the biggest
child; with `restart` the bot restarts if it stays over for 20 s (index.js respawns it).
