// ─────────────────────────────────────────────
// WRAITH · modules/details.js
// .details <command> — Explains how a command works and how to use it
// .details all — Summarizes details for all commands
// ─────────────────────────────────────────────
import { sendWithCta } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';

const BASE_COMMAND_DETAILS = {
  // ── CORE ──
  alive: {
    title: '🟢 Alive Command',
    description: 'Checks if the bot is active and responsive, displaying runtime statistics.',
    usage: ['.alive'],
  },
  ping: {
    title: '⚡ Ping Command',
    description: 'Measures bot response latency and server execution speed.',
    usage: ['.ping'],
  },
  uptime: {
    title: '⏱️ Uptime Command',
    description: 'Displays the total active running time of the bot instance.',
    usage: ['.uptime'],
  },
  restart: {
    title: '🔄 Restart Command',
    description: 'Restarts the current session worker process.',
    usage: ['.restart'],
  },
  help: {
    title: '📜 Help / Menu Command',
    description: 'Displays the complete interactive or formatted command list by category.',
    usage: ['.help', '.menu', '.help <category>'],
  },
  usermanual: {
    title: '📖 User Manual Command',
    description: 'Fetches and sends the official Wraith PDF user manual document.',
    usage: ['.usermanual'],
  },
  prefix: {
    title: '⚙️ Prefix Command',
    description: 'Views or updates the command prefix character for the bot.',
    usage: ['.prefix', '.prefix <new_prefix>'],
  },
  mode: {
    title: '🔒 Mode Command',
    description: 'Toggles bot operation mode between public and private (owner-only).',
    usage: ['.mode public', '.mode private'],
  },
  replymode: {
    title: '💬 Reply Mode Command',
    description: 'Switches bot reply interface between interactive buttons and formatted plain text.',
    usage: ['.replymode buttons', '.replymode text'],
  },
  update: {
    title: '🆙 Update Command',
    description: 'Pulls the latest code updates from the repository.',
    usage: ['.update'],
  },
  script: {
    title: '📜 Script / Repo Command',
    description: 'Displays repository details and source information.',
    usage: ['.script', '.repo'],
  },
  owner: {
    title: '👑 Owner Command',
    description: 'Displays the bot owner contact card and information.',
    usage: ['.owner'],
  },

  // ── GHOST / PEEK / LURK ──
  ghost: {
    title: '👻 Ghost Mode (Antidelete & Antiedit)',
    description: 'Silently captures deleted and edited messages, media, and view-once messages. Saved content is sent directly to your owner chat.',
    usage: [
      '.ghost — Show current status and menu',
      '.ghost on | off — Toggle antidelete watcher',
      '.ghost edit on | off — Toggle antiedit watcher',
    ],
    notes: 'Ghost ignores messages sent by yourself and handles bounded memory queues.',
  },
  lurk: {
    title: '🌒 Lurk Mode (Status Watcher)',
    description: 'Automatically views, reacts to, and downloads status updates without marking them as seen.',
    usage: [
      '.lurk — View status watcher menu',
      '.lurk on | off — Toggle status auto-view',
      '.lurk react on | off — Toggle status auto-reaction',
      '.lurk download on | off — Toggle status media download',
      '.lurk emoji <emoji | random | none> — Set reaction emoji',
    ],
  },
  peek: {
    title: '👁️ Peek Mode (View-Once Revealer)',
    description: 'Reveals view-once images, videos, and audio messages in direct chats or from quoted message replies.',
    usage: [
      '.peek — View peek settings',
      '.peek auto on | off — Toggle automatic view-once capture',
      '.peek watch on | off — Toggle quoted view-once watcher',
      '.peek dest <owner | same | both> — Set reveal destination',
    ],
  },
  schedule: {
    title: '⏰ Schedule Command',
    description: 'Schedules automated message delivery for future dates and times.',
    usage: [
      '.schedule <text> <YYYY-MM-DD> <HH:MM> — Schedule text message',
      '.schedule list — View pending scheduled tasks',
      '.schedule cancel <id> — Cancel scheduled message',
    ],
  },

  // ── UTILITY ──
  currency: {
    title: '💱 Currency Converter',
    description: 'Converts currency amounts using real-time exchange rate data.',
    usage: ['.currency <amount> <from_currency> <to_currency>', 'Example: .currency 100 USD EUR'],
  },
  qr: {
    title: '📱 QR Code Generator & Reader',
    description: 'Generates a QR code image from text or reads text from a quoted QR image.',
    usage: ['.qr <text_or_url>', 'Reply to an image with .qr read'],
  },
  define: {
    title: '📚 Dictionary Definition',
    description: 'Looks up word definitions, phonetics, and examples.',
    usage: ['.define <word>'],
  },
  weather: {
    title: '🌤️ Weather Forecast',
    description: 'Fetches current weather conditions and temperature for a city.',
    usage: ['.weather <city_name>'],
  },
  pwned: {
    title: '🔐 Password Breach Check',
    description: 'Checks whether a password has appeared in known data breaches.',
    usage: ['.pwned <password>'],
  },
  url: {
    title: '🔗 Media URL Uploader',
    description: 'Uploads quoted image/video/document and generates a direct public link.',
    usage: ['Reply to any media with .url'],
  },
  reqlocation: {
    title: '📍 Request / Share Location',
    description: 'Sends an interactive location request CTA button in chat.',
    usage: ['.reqlocation', '.relocation'],
  },
  shorten: {
    title: '✂️ URL Shortener',
    description: 'Shortens long URLs into compact TinyURL or is.gd links.',
    usage: ['.shorten <long_url>'],
  },
  news: {
    title: '📰 Google News RSS',
    description: 'Fetches recent news headlines for a specific topic or general news.',
    usage: ['.news', '.news <topic>'],
  },
  hackernews: {
    title: '🔥 HackerNews Top Stories',
    description: 'Fetches top trending tech articles from HackerNews.',
    usage: ['.hackernews', '.hn'],
  },
  wiki: {
    title: '🌐 Wikipedia Summary',
    description: 'Searches Wikipedia and provides a concise article summary.',
    usage: ['.wiki <topic>'],
  },
  joke: {
    title: '😂 Random Joke',
    description: 'Delivers a funny random joke.',
    usage: ['.joke'],
  },
  advice: {
    title: '💡 Useful Advice',
    description: 'Delivers a random piece of practical advice.',
    usage: ['.advice'],
  },
  fact: {
    title: '🧠 Random Fact',
    description: 'Shares an interesting random trivia fact.',
    usage: ['.fact'],
  },

  // ── ISLAMIC ──
  prayertimes: {
    title: '🕌 Prayer Times',
    description: 'Fetches daily Islamic prayer timings for any city worldwide via Aladhan API.',
    usage: ['.prayertimes <city>', '.pts <city>'],
  },
  quran: {
    title: '📖 Quran Verse Lookup',
    description: 'Looks up specific Quranic verses in Arabic and English (Saheeh International).',
    usage: ['.quran <surah:ayah>', 'Example: .quran 2:255 or .quran Yasin 1'],
  },
  sora: {
    title: '📄 Full Surah PDF Downloader',
    description: 'Downloads the complete PDF document for any Surah (1 to 114).',
    usage: ['.sora <surah_name_or_number>'],
  },
  para: {
    title: '📑 Quran Juz / Para PDF Downloader',
    description: 'Downloads the complete PDF document for any Juz / Para (1 to 30).',
    usage: ['.para <1-30>'],
  },
  muslim: {
    title: '📜 Sahih Muslim Hadith',
    description: 'Fetches Arabic and English Hadith text from Sahih Muslim by number.',
    usage: ['.muslim <hadith_number>'],
  },
  bukhari: {
    title: '📜 Sahih Bukhari Hadith',
    description: 'Fetches Arabic and English Hadith text from Sahih Bukhari by number.',
    usage: ['.bukhari <hadith_number>'],
  },
  searchquran: {
    title: '🔍 Quran Keyword Search',
    description: 'Searches English Quran translation for matching keywords and returns top verses.',
    usage: ['.search quran <topic_or_keyword>'],
  },
  quransearch: {
    title: '🤖 AI Quran Search',
    description: 'Uses Gemini AI to find relevant Quranic verses and provides a 2-5 line explanation connecting your question to the verses.',
    usage: ['.quransearch <question_or_topic>'],
  },
  hadeessearch: {
    title: '🤖 AI Hadees Search',
    description: 'Uses Gemini AI to search 10 authentic Hadith collections and provides a 2-5 line explanation connecting your question to the Hadiths.',
    usage: ['.hadeessearch <question_or_topic>'],
  },
  islamsearch: {
    title: '🕋 AI Islam Search (Quran & Hadees)',
    description: 'Comprehensive Islamic AI search that queries both Quran and Hadiths, providing a 2-5 line explanation relating the sources to your question.',
    usage: ['.islamsearch <question_or_topic>'],
  },

  // ── MEDIA & AI ──
  book: {
    title: '📚 Book Search & Downloader',
    description: 'Searches multi-tier book repositories (Internet Archive, Gutendex, Open Library) and downloads PDF/EPUB books.',
    usage: [
      '.book <title or author> — Search books',
      '.book dl <number> — Download specific search result',
    ],
  },
  img: {
    title: '🖼️ Image Search',
    description: 'Searches and downloads high quality images for a given query.',
    usage: ['.img <query> [count]'],
  },
  gemini: {
    title: '🤖 Gemini AI Assistant',
    description: 'Generates AI text answers directly using Google Gemini models.',
    usage: [
      '.gemini <question or prompt>',
      'Reply to any message with .gemini <question> to analyze or summarize quoted text',
    ],
  },
  photo: {
    title: '📸 AI Photo Generator',
    description: 'Generates AI images using official Gemini photo models (gemini-3.1-flash-lite-image, fallback to gemini-3.1-flash-image).',
    usage: ['.photo <prompt>', '.imagine <prompt>'],
  },
  scholar: {
    title: '🎓 AI Scholar & Professor (.scholar / .scholor)',
    description: 'Acts as an expert university scholar/professor to explain complex topics/questions. Explains concepts first (mental models & principles) before details, making learning easy and clear.',
    usage: ['.scholar <topic or question>', '.scholor <topic or question>'],
  },
  couplepp: {
    title: '👩‍❤️‍👨 Couple Profile Pictures',
    description: 'Fetches matching profile picture pairs for couples.',
    usage: ['.couplepp'],
  },
  movie: {
    title: '🎬 Movie Info Search',
    description: 'Looks up details, ratings, plot summaries, and release dates for movies.',
    usage: ['.movie <movie_title>'],
  },
  songinfo: {
    title: '🎶 Song Details',
    description: 'Fetches song metadata, album info, and artist details.',
    usage: ['.songinfo <title> [artist]'],
  },
  lyrics: {
    title: '🎼 Song Lyrics',
    description: 'Fetches full song lyrics for a given track.',
    usage: ['.lyrics <artist> - <title>'],
  },
  ppt: {
    title: '📊 PPT Generator',
    description: 'Creates professional PowerPoint (.pptx) presentations using AI slide structuring and pptxgenjs rendering.',
    usage: ['.ppt <topic or outline>'],
  },

  // ── DOWNLOAD ──
  dl: {
    title: '⬇️ Universal Downloader',
    description: 'Downloads media files directly from supported URLs.',
    usage: ['.dl <url>', '.dl audio <url>', '.dl mp3 <url>'],
  },
  mp3: {
    title: '🎧 MP3 Downloader',
    description: 'Downloads audio tracks from supported links as MP3.',
    usage: ['.mp3 <url>'],
  },
  play: {
    title: '🎵 Play Command',
    description: 'Searches YouTube / SoundCloud for music audio and delivers MP3 audio directly in chat.',
    usage: ['.play <song title or YouTube URL>'],
  },
  ytv: {
    title: '🎬 YTV / Video Command',
    description: 'Downloads YouTube videos and optimizes them to WhatsApp playable MP4 video.',
    usage: ['.ytv <video title or URL>', '.video <video title or URL>'],
  },
  ytdl: {
    title: '📹 YouTube Downloader',
    description: 'Downloads YouTube videos directly via yt-dlp with cookie support.',
    usage: ['.ytdl <video url>'],
  },
  pdl: {
    title: '📱 Social Post Downloader',
    description: 'Downloads multi-media posts, carousels, or slideshows from Instagram, TikTok, Facebook, etc.',
    usage: ['.pdl <post_url>'],
  },
  pdlzip: {
    title: '📦 Post Downloader Zip',
    description: 'Downloads multi-item social posts and bundles them into a ZIP file.',
    usage: ['.pdlzip <post_url>'],
  },
  twitter: {
    title: '🐦 Twitter / X Video Downloader',
    description: 'Downloads media and videos from Twitter / X tweets.',
    usage: ['.twitter <tweet_url>', '.tw <tweet_url>'],
  },
  pinterest: {
    title: '📌 Pinterest Media Downloader',
    description: 'Downloads images and videos from Pinterest pins.',
    usage: ['.pinterest <pin_url>', '.pin <pin_url>'],
  },
  threads: {
    title: '🧵 Threads Media Downloader',
    description: 'Downloads media posts from Threads.',
    usage: ['.threads <threads_url>'],
  },
  reddit: {
    title: '🤖 Reddit Media Downloader',
    description: 'Downloads videos and images from Reddit posts.',
    usage: ['.reddit <reddit_url>'],
  },
  youtube: {
    title: '🔴 YouTube Media Downloader',
    description: 'Downloads videos or audio tracks directly from YouTube links.',
    usage: ['.youtube <youtube_url>', '.yt <youtube_url>'],
  },
  gitdl: {
    title: '🐙 GitHub Repo Downloader',
    description: 'Downloads a GitHub repository as a zip archive.',
    usage: ['.gitdl <github_repo_url>'],
  },
  mfdl: {
    title: '📁 MediaFire File Downloader',
    description: 'Downloads files hosted on MediaFire.',
    usage: ['.mfdl <mediafire_url>'],
  },

  // ── DISPLAY / WALLPAPERS ──
  wp: {
    title: '🖼️ Wallpaper Command',
    description: 'Delivers high-resolution preset wallpapers or sets custom group/chat wallpaper from quoted photo.',
    usage: ['.wp1 ... .wp10', '.wp (reply photo)', '.reset wp'],
  },
  dp: {
    title: '👤 Profile Picture Setter',
    description: 'Updates group or personal profile picture from quoted photo.',
    usage: ['Reply to a photo with .dp'],
  },

  // ── TEXTMAKER ──
  textmaker: {
    title: '🪄 Ephoto360 Text Effects',
    description: 'Generates stylized text graphic logos across 50+ Ephoto360 artistic templates.',
    usage: ['.textmaker <effect> <text>', '.neon <text>', '.glitch <text>', '.marvel <text1 ; text2>'],
  },

  // ── SOCIAL ──
  ig: {
    title: '📸 Instagram Profile & Post Downloader',
    description: 'Fetches Instagram user profile info or downloads Instagram post media.',
    usage: ['.ig <username_or_url>'],
  },
  tiktok: {
    title: '🎵 TikTok Downloader & Stalk',
    description: 'Fetches TikTok user profile info or downloads TikTok videos without watermark.',
    usage: ['.tiktok <username_or_url>'],
  },
  fb: {
    title: '📘 Facebook Video Downloader',
    description: 'Downloads public Facebook videos in high quality.',
    usage: ['.fb <facebook_video_url>'],
  },

  // ── GROUP ADMIN ──
  open: {
    title: '🔓 Open Group Chat',
    description: 'Allows all participants to send messages in the group.',
    usage: ['.open'],
  },
  close: {
    title: '🔒 Close Group Chat',
    description: 'Restricts message sending in the group to admins only.',
    usage: ['.close'],
  },
  kick: {
    title: '👞 Kick Participant',
    description: 'Removes a participant from the group chat.',
    usage: ['.kick (reply to user or mention number)'],
  },
  add: {
    title: '➕ Add Participant',
    description: 'Adds a participant to the group chat by phone number.',
    usage: ['.add <phone_number>'],
  },
  promote: {
    title: '👑 Promote Admin',
    description: 'Promotes a group participant to group admin.',
    usage: ['.promote (reply to user or mention number)'],
  },
  demote: {
    title: '⬇️ Demote Admin',
    description: 'Demotes a group admin back to regular participant.',
    usage: ['.demote (reply to user or mention number)'],
  },
  tagall: {
    title: '📣 Tag All Participants',
    description: 'Mentions every member in the group chat with a custom message.',
    usage: ['.tagall [message]', '.tag [message]'],
  },
  hidetag: {
    title: '👻 Silent Tag All',
    description: 'Silently mentions all group members without cluttering the chat with visible mentions.',
    usage: ['.hidetag [message]'],
  },
  pdd: {
    title: '🛡️ Promote / Demote Detection (PDD)',
    description: 'Monitors group participant admin updates and sends alerts when admin status changes.',
    usage: ['.pdd on | off'],
  },
  pinchat: {
    title: '📌 Pin Chat',
    description: 'Pins the current chat to the top of the WhatsApp chat list.',
    usage: ['.pinchat'],
  },
  unpinchat: {
    title: '📌 Unpin Chat',
    description: 'Unpins the current chat from the top of the WhatsApp chat list.',
    usage: ['.unpinchat'],
  },
  setgdesc: {
    title: '📝 Set Group Description',
    description: 'Updates the group chat description text.',
    usage: ['.setgdesc <new_description>'],
  },
  setgpp: {
    title: '🖼️ Set Group Picture',
    description: 'Updates group profile picture from quoted image.',
    usage: ['Reply to an image with .setgpp'],
  },
  welcome: {
    title: '👋 Group Welcome Message',
    description: 'Toggles automated welcome greeting messages for new group members.',
    usage: ['.welcome on', '.welcome off'],
  },
  goodbye: {
    title: '👋 Group Goodbye Message',
    description: 'Toggles automated goodbye departure messages when members leave.',
    usage: ['.goodbye on', '.goodbye off'],
  },
  protection: {
    title: '🛡️ Group Protection Toggles',
    description: 'Toggles antilink, antispam, or antisticker enforcement in groups.',
    usage: ['.antilink on|off', '.antispam on|off', '.antisticker on|off'],
  },
  kickall: {
    title: '⚠️ Kick All Members',
    description: 'Kicks all non-admin members from the group chat.',
    usage: ['.kickall'],
  },
  kickcc: {
    title: '🌐 Kick Country Code',
    description: 'Kicks group members matching a specific country calling code.',
    usage: ['.kickcc <code>', 'Example: .kickcc 92'],
  },
  approveall: {
    title: '✅ Approve All Join Requests',
    description: 'Approves all pending participant join requests in group.',
    usage: ['.approveall'],
  },
  declineall: {
    title: '❌ Decline All Join Requests',
    description: 'Declines all pending participant join requests in group.',
    usage: ['.declineall'],
  },
  leave: {
    title: '🚪 Leave Group',
    description: 'Causes the bot to leave the current group chat.',
    usage: ['.leave'],
  },
  join: {
    title: '🔗 Join Group via Link',
    description: 'Joins a WhatsApp group using an invite link.',
    usage: ['.join <group_invite_link>'],
  },

  // ── OWNER PROFILE & VARS ──
  setpp: {
    title: '👤 Set Bot Profile Picture',
    description: 'Updates bot user profile picture from quoted photo.',
    usage: ['Reply to a photo with .setpp'],
  },
  setabout: {
    title: '💬 Set Bot Status About',
    description: 'Updates the bot profile status / about text.',
    usage: ['.setabout <text>'],
  },
  setstatus: {
    title: '📝 Set WhatsApp Status',
    description: 'Posts a text or media status update to WhatsApp status broadcast.',
    usage: ['.setstatus <text>', 'Reply to media with .setstatus <caption_optional>'],
  },
  getstatus: {
    title: '🔍 Get User Status / About',
    description: 'Fetches status about text for a specified contact or phone number.',
    usage: ['.getstatus <phone_number_or_jid>'],
  },
  getpair: {
    title: '🔑 Generate Pairing Code',
    description: 'Generates a secondary session pairing code for linking devices.',
    usage: ['.getpair <phone_number>'],
  },
  setsession: {
    title: '📱 Set Primary Session Number',
    description: 'Updates owner primary session configuration.',
    usage: ['.setsession <owner_number>'],
  },
  addsession: {
    title: '➕ Add Multi-Session Instance',
    description: 'Spawns and initializes a new isolated session instance.',
    usage: ['.addsession <phone_number>'],
  },
  delsession: {
    title: '🗑️ Delete Session Instance',
    description: 'Stops and deletes an existing session instance by ID.',
    usage: ['.delsession <session_id>'],
  },
  setvar: {
    title: '🔧 Set Custom Variable',
    description: 'Saves a persistent custom configuration variable in memory and state/vars.json.',
    usage: ['.setvar <KEY> <VALUE>', 'Example: .setvar GEMINI_API_KEY AIzaSy...'],
  },
  getvar: {
    title: '🔍 Get Custom Variable',
    description: 'Displays saved persistent configuration variables.',
    usage: ['.getvar <KEY>', '.getvar all'],
  },
  delvar: {
    title: '🗑️ Delete Custom Variable',
    description: 'Deletes a persistent configuration variable from storage and environment.',
    usage: ['.delvar <KEY>'],
  },
  block: {
    title: '🚫 Block Contact',
    description: 'Blocks a target user on WhatsApp.',
    usage: ['.block (reply to user or specify phone number)'],
  },
  unblock: {
    title: '✅ Unblock Contact',
    description: 'Unblocks a target user on WhatsApp.',
    usage: ['.unblock (reply to user or specify phone number)'],
  },
  blocklist: {
    title: '📋 Blocklist Overview',
    description: 'Displays all currently blocked WhatsApp contacts.',
    usage: ['.blocklist'],
  },
  unblockall: {
    title: '🔓 Unblock All Contacts',
    description: 'Unblocks all contacts from the blocked user list.',
    usage: ['.unblockall'],
  },
  rejectcalls: {
    title: '📞 Call Rejector',
    description: 'Toggles automatic rejection of incoming WhatsApp voice and video calls.',
    usage: ['.rejectcalls on', '.rejectcalls off'],
  },
  stalk: {
    title: '👁️ Stalk / Presence Tracker',
    description: 'Tracks online/offline status changes and presence transitions for target contacts.',
    usage: ['.stalk <phone_number>', '.stalk list', '.stalk stop <phone_number>'],
  },
  chatstats: {
    title: '📊 Chat Statistics',
    description: 'Displays message count and interaction statistics for a contact or group.',
    usage: ['.chatstats <phone_number_or_jid>'],
  },
  addowner: {
    title: '👑 Add Bot Owner',
    description: 'Grants full bot admin/owner privileges to a new phone number.',
    usage: ['.addowner <phone_number>'],
  },
  delowner: {
    title: '🗑️ Delete Bot Owner',
    description: 'Revokes bot owner privileges from a phone number.',
    usage: ['.delowner <phone_number>'],
  },
  ownerlist: {
    title: '📜 Owner List',
    description: 'Lists all authorized bot owners.',
    usage: ['.ownerlist'],
  },

  // ── CHAT CONTROLS ──
  disappearing: {
    title: '⏱️ Disappearing Messages',
    description: 'Sets disappearing message timer for current chat.',
    usage: [
      '.disappearing 0s — Turn off',
      '.disappearing 24h — Set to 24 hours',
      '.disappearing 7d — Set to 7 days',
      '.disappearing 90d — Set to 90 days',
    ],
  },
  ytcookies: {
    title: '🍪 YouTube Cookies (.ytcookies)',
    description: 'Configures Netscape formatted YouTube cookies for yt-dlp to bypass bot detection, sign-in restrictions, and age gate limits when downloading media.',
    usage: [
      '.ytcookies — Show guide on how to export and set YouTube cookies',
      '.ytcookies status — Check active YouTube cookies status',
      '.ytcookies clear | del — Remove saved YouTube cookies',
      '.ytcookies <pasted cookies text> — Save Netscape format cookies text',
      'Reply to a cookies.txt document file with .ytcookies — Save uploaded cookie file',
    ],
    notes: 'Cookies are stored per-session in data/youtube_cookies.txt and automatically attached to yt-dlp downloads.',
  },
  mute: {
    title: '🔇 Mute Chat Notifications',
    description: 'Mutes notifications for current chat for a set duration.',
    usage: ['.mute 8h', '.mute 1d', '.mute forever'],
  },
  unmute: {
    title: '🔊 Unmute Chat Notifications',
    description: 'Unmutes notifications for current chat.',
    usage: ['.unmute'],
  },
  archive: {
    title: '📦 Archive Chat',
    description: 'Archives the current chat.',
    usage: ['.archive'],
  },
  unarchive: {
    title: '📤 Unarchive Chat',
    description: 'Unarchives the current chat.',
    usage: ['.unarchive'],
  },
  clearchat: {
    title: '🧹 Clear Chat Messages',
    description: 'Clears all messages in current chat window.',
    usage: ['.clearchat'],
  },

  // ── JID / PROFILE ──
  getjid: {
    title: '🧭 Get JID / LID',
    description: 'Displays the WhatsApp JID or LID for current chat or quoted contact.',
    usage: ['.getjid'],
  },
  getpp: {
    title: '🖼️ Get Profile Picture',
    description: 'Fetches high-resolution profile picture of user or group.',
    usage: ['.getpp [number_or_jid]'],
  },
  presence: {
    title: '🟢 Presence Settings',
    description: 'Controls online status, auto-typing, auto-recording, and read receipts.',
    usage: [
      '.presence — View current presence settings',
      '.presence alwaysonline on | off',
      '.presence autotyping on | off',
      '.presence autorecording on | off',
      '.presence readreceipts on | off',
    ],
  },
  activity: {
    title: '📈 User Activity Tracker',
    description: 'Displays message activity metrics across tracked chats.',
    usage: ['.activity'],
  },
  settings: {
    title: '⚙️ Settings Overview',
    description: 'Displays current operational status across all system modes and feature toggles in a single overview.',
    usage: ['.settings'],
  },
  forward: {
    title: '⏩ Forward Command',
    description: 'Forwards text messages, media, or quoted messages to target JID, LID, or phone number.',
    usage: [
      '.forward <text> <JID / Phone>',
      'Reply to text or media with .forward <JID / Phone>',
      'Reply to text or media with .forward <custom caption> <JID / Phone>',
    ],
  },
};

// Map Command Aliases so .details works for all synonym command names
const COMMAND_DETAILS = {
  ...BASE_COMMAND_DETAILS,
  // Aliases
  menu: BASE_COMMAND_DETAILS.help,
  repo: BASE_COMMAND_DETAILS.script,
  relocation: BASE_COMMAND_DETAILS.reqlocation,
  tinyurl: BASE_COMMAND_DETAILS.shorten,
  shorturl: BASE_COMMAND_DETAILS.shorten,
  hn: BASE_COMMAND_DETAILS.hackernews,
  wikipedia: BASE_COMMAND_DETAILS.wiki,
  pts: BASE_COMMAND_DETAILS.prayertimes,
  scholor: BASE_COMMAND_DETAILS.scholar,
  imagine: BASE_COMMAND_DETAILS.photo,
  video: BASE_COMMAND_DETAILS.ytv,
  tw: BASE_COMMAND_DETAILS.twitter,
  pin: BASE_COMMAND_DETAILS.pinterest,
  yt: BASE_COMMAND_DETAILS.youtube,
  postdl: BASE_COMMAND_DETAILS.pdl,
  books: BASE_COMMAND_DETAILS.book,
  tag: BASE_COMMAND_DETAILS.tagall,
  antilink: BASE_COMMAND_DETAILS.protection,
  antispam: BASE_COMMAND_DETAILS.protection,
  antisticker: BASE_COMMAND_DETAILS.protection,
  qs: BASE_COMMAND_DETAILS.quransearch,
  hs: BASE_COMMAND_DETAILS.hadeessearch,
  is: BASE_COMMAND_DETAILS.islamsearch,
};

export async function detailsCommand(sock, chat, msg, args) {
  const p = getPrefix();
  const query = (args || []).join(' ').toLowerCase().trim();

  if (!query || query === 'all') {
    let listText = `📘 *WRAITH Detailed Command Guide*\n\n`;
    listText += `Below are extensive details, usage guidelines, and examples for commands:\n\n`;

    const processedKeys = new Set();
    for (const [cmd, data] of Object.entries(COMMAND_DETAILS)) {
      if (processedKeys.has(data.title)) continue;
      processedKeys.add(data.title);

      listText += `━━━━━━━━━━━━━━━━━━━━━\n`;
      listText += `${data.title}\n`;
      listText += `📝 *Description:* ${data.description}\n`;
      listText += `💡 *Usage & Examples:*\n`;
      for (const u of data.usage) {
        listText += `• \`${u}\` \n`;
      }
      if (data.notes) {
        listText += `📌 *Note:* ${data.notes}\n`;
      }
      listText += `\n`;
    }

    listText += `Provided by 𝗪𝗥𝗔𝗜𝗧🇭`;
    return sendWithCta(sock, chat, listText, { quoted: msg });
  }

  const detailKey = query.replace(/^[\.\/]/, '');
  const data = COMMAND_DETAILS[detailKey];

  if (!data) {
    return sendWithCta(sock, chat, `❓ *No details found for '${query}'*\n\nType \`${p}details all\` to view details for all available commands.`, { quoted: msg });
  }

  let text = `${data.title}\n\n`;
  text += `📝 *Description:*\n${data.description}\n\n`;
  text += `💡 *Usage & Examples:*\n`;
  for (const u of data.usage) {
    text += `• \`${u}\` \n`;
  }

  if (data.notes) {
    text += `\n📌 *Note:* ${data.notes}\n`;
  }

  text += `\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`;
  return sendWithCta(sock, chat, text, { quoted: msg });
}
