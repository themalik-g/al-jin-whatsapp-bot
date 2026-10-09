# Movie downloader + speech-to-text changes

- lib/stt.js: Groq now uses whisper-large-v3 (most accurate), whisper-large-v3-turbo only as backup (separate Groq quota). Override: GROQ_STT_MODEL. Gemini tries gemini-2.5-flash before flash-lite. Used by .trb/.trt and .st subtitles.
- lib/moviebox.js: result typing handles subjectType/type/isSeries (series were being filtered out -> silent Internet Archive fallback); reads up to 3 result pages; season parser; 'best' quality respects the .dlcap height limit.
- modules/x-movie.js: all spelling variants searched in parallel and merged; results paged (5 per page + "More results", up to 25); Internet Archive is only appended when Moviebox has few/weak matches and says why; series support seasons (-s 2 -ep 5, -s 2 -full, -full = all seasons).
- @lzwme/m3u8-dl only downloads HLS streams (it cannot list titles); the catalogue comes from moviebox-js-sdk.
