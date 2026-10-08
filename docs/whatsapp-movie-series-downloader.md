# Free Movie & Series Downloader for WhatsApp

Al-Jin can search, download and send **public-domain and freely licensed movies and TV series** directly in WhatsApp. The source is the **Internet Archive** (archive.org): free, no API key, and legal to download. It does not use torrents or pirate sites.

> Because the source only contains public-domain and freely licensed titles, recent commercial films will not appear. Older classics, silent films, cartoons, old TV shows and freely licensed releases will.

## Commands

| Command | Description |
|---|---|
| `.movie <name>` | Search movies → pick a result → pick a quality → download and send |
| `.series <name> -ep <number>` | Download one episode of a series |
| `.series <name> -full` | Download a whole series, 3 episodes at a time |
| `.continue` | Send the next 3 episodes of the running `-full` series |
| `.movieinfo <title>` | Movie details: rating, plot, release date (this was the old `.movie`) |

Aliases: `.movies`, `.moviedl` (movie) · `.tvseries`, `.seriesdl` (series) · `.cont` (continue) · `.minfo` (movieinfo). `.movie` with no name shows usage.

## How `.movie` works

1. `.movie nosferatu` — the bot lists the **top 5 results** (most downloaded first).
2. You pick one by number (or tap/vote, depending on `.replymode`).
3. The bot lists the **qualities that file really offers**, between 360p and 1080p, each with its size. Options your limits do not allow are marked ⛔.
4. You pick a quality. The bot checks it against `.dlcap`, downloads, uploads to the chat, and **deletes the file from the server**.

If a title offers only one quality, step 3 is skipped.

## How `.series` works

**One episode:** `.series <name> -ep 11` → pick the show → pick a quality → that episode is sent. If the show does not contain episode 11, the bot tells you which episode numbers it does have.

**Whole series:** `.series <name> -full` → pick the show. For every episode the bot automatically selects the **highest quality that fits your `.dlcap` size cap and quality limit**, tells you how many episodes fit (and which were skipped), then sends **3 episodes**. Send `.continue` for the next 3, and repeat until it says the last episode was sent.

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
| Search | Internet Archive advanced search | Internet Archive scrape API, then a looser title-only search |
| File list | Item metadata (JSON) | The item's `_files.xml` listing |
| Download | `archive.org/download/…` | The item's own storage server |

Errors are always sent back to WhatsApp as a message; they never stop the bot.

## Tips

- Search with the simple title: `.movie night of the living dead`.
- For a series, include the show name only; the episode goes after `-ep`.
- If a series is split into one item per season, pick the season you want from the results.
- Files that are not MP4 (for example MKV) are sent as documents.
