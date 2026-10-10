# Free Movie & Series Downloader for WhatsApp

Al-Jin can search, download and send **movies and TV series** directly in WhatsApp. Results come from the **Moviebox catalogue** (through `moviebox-js-sdk`). When Moviebox has few or weak matches, the **Internet Archive** (archive.org) adds public-domain and freely licensed titles. The result message always shows the source.

> Only download content you have the right to download. Copyright rules differ by country and you are responsible for how you use the bot.

## Commands

| Command | Description |
|---|---|
| `.movie <name>` | Search movies → pick a result → pick a quality → download and send |
| `.series <name> -ep <number>` | One episode (season 1) |
| `.series <name> -s <season> -ep <number>` | One episode of a chosen season (`-s` or `-season`) |
| `.series <name> -s <season> -full` | A whole season, 3 episodes at a time |
| `.series <name> -full` | All seasons, 3 episodes at a time |
| `.continue` | Send the next 3 episodes of the running `-full` series |
| `.movieinfo <title>` | Movie details: rating, plot, release date (this was the old `.movie`) |

Aliases: `.movies`, `.moviedl` (movie) · `.tvseries`, `.seriesdl` (series) · `.cont` (continue) · `.minfo` (movieinfo). `.movie` with no name shows usage.

## How `.movie` works

1. `.movie nosferatu` — the bot searches every spelling variant and every result page, then lists the matches **5 per page**. Tap **➡️ More results** for the next page (up to 25 titles).
2. You pick one by number (or tap/vote, depending on `.replymode`).
3. For Internet Archive titles the bot lists the **qualities the file really offers** (360p–1080p) with sizes; options your limits do not allow are marked ⛔. For Moviebox titles it picks the highest quality within your `.dlcap` height limit.
4. You pick a quality. The bot checks it against `.dlcap`, downloads, uploads to the chat, and **deletes the file from the server**.

If a title offers only one quality, step 3 is skipped.

## How `.series` works

**One episode:** `.series <name> -s 2 -ep 11` → pick the show → season 2, episode 11 is sent (without `-s` it is season 1). If the show does not contain episode 11, the bot tells you which episode numbers it does have.

**Whole series or season:** `.series <name> -full` (all seasons) or `.series <name> -s 2 -full` (one season) → pick the show. For every episode the bot automatically selects the **highest quality that fits your `.dlcap` size cap and quality limit**, tells you how many episodes fit (and which were skipped), then sends **3 episodes**. Send `.continue` for the next 3, and repeat until it says the last episode was sent.

Episodes are sent one by one; a failed episode is reported and skipped without stopping the batch.

## Limits it obeys

All limits come from the owner's `.dlcap` settings:

| Setting | Effect on movies and series |
|---|---|
| `.dlcap <size>` | Files above this size are refused (default 500 MB) |
| `.dlcap quality <height>` | Qualities above this height are refused (default 480p) |
| Document threshold | Large files are sent as documents instead of videos |

Raise them with, for example, `.dlcap 1gb` and `.dlcap quality 1080`.

## Resource safety

- One download at a time (a queue message tells you your position).
- Files are streamed to disk, never held in memory.
- Every file is deleted right after sending, even when the upload fails.
- In text reply mode, answer with the number within 2 minutes (poll and button replies work until their own timeout).
- Selections expire after 15 minutes; `.continue` stays valid for 3 hours.
- Progress is edited into a single status message.

## Reliability and fallbacks

| Step | Primary | Fallback |
|---|---|---|
| Search | Moviebox, all spelling variants in parallel, up to 3 result pages | Internet Archive search when Moviebox has few or weak matches or does not answer |
| Quality | Highest quality within `.dlcap` height | The source's own best quality |
| Internet Archive files | Item metadata (JSON) | The item's `_files.xml` listing, then the item's own storage server |

If Moviebox does not respond, the message says so and shows public-domain results only. Errors are always sent back to WhatsApp as a message; they never stop the bot.

## Tips

- Search with the simple title: `.movie night of the living dead`.
- For a series, include the show name only; the episode goes after `-ep`.
- Use `-s <season>` for later seasons; Internet Archive shows may list one item per season instead.
- Titles marked `· IA` in a mixed list come from the Internet Archive.
- Files that are not MP4 (for example MKV) are sent as documents.
