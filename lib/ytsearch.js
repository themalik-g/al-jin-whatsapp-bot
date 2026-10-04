// ─────────────────────────────────────────────
// Al-Jin · lib/ytsearch.js
// Tiny dependency-free YouTube search (reads the public results page).
// ytSearch(query, limit) → [{ id, title, duration, channel, url }]
// Throws one readable Error when YouTube can't be reached / the page changed.
// ─────────────────────────────────────────────
import { httpGetText, BROWSER_USER_AGENT } from './net.js';

const VIDEO_FILTER = 'EgIQAQ%3D%3D'; // "videos only"

function walk(node, out, cap) {
  if (!node || typeof node !== 'object' || out.length >= cap) return;
  const v = node.videoRenderer;
  if (v && v.videoId) {
    out.push({
      id: v.videoId,
      title: (v.title?.runs || []).map((r) => r.text).join('') || 'Video',
      duration: v.lengthText?.simpleText || '',
      channel: v.ownerText?.runs?.[0]?.text || '',
      url: `https://youtu.be/${v.videoId}`,
    });
    return;
  }
  for (const key of Object.keys(node)) walk(node[key], out, cap);
}

export function isYoutubeUrl(text) {
  return /^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(String(text || '').trim());
}

// King uses the `yt-search` package and it works there, so try it first.
// If it is not installed or returns nothing, fall back to the page scraper below.
async function viaYtSearchPackage(q, limit) {
  try {
    const mod = await import('yt-search');
    const yts = mod.default || mod;
    const res = await yts(q);
    return (res?.videos || []).slice(0, limit).map((v) => ({
      id: v.videoId,
      title: v.title || 'Video',
      duration: v.timestamp || '',
      channel: v.author?.name || '',
      url: `https://youtu.be/${v.videoId}`,
    }));
  } catch { return []; }
}

async function scrapeSearch(q, limit) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${VIDEO_FILTER}`;
  const html = await httpGetText(url, {
    timeout: 15000,
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: 'CONSENT=YES+1; SOCS=CAI',
    },
  });

  const out = [];
  const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (m) {
    try { walk(JSON.parse(m[1]), out, limit * 4); } catch { /* fall through to regex */ }
  }
  if (!out.length) {
    const ids = [...new Set([...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((x) => x[1]))];
    for (const id of ids.slice(0, limit)) out.push({ id, title: 'Video', duration: '', channel: '', url: `https://youtu.be/${id}` });
  }
  if (!out.length) throw new Error('YouTube search returned nothing (page layout may have changed).');

  const seen = new Set();
  return out.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).slice(0, limit);
}

/** yt-search package → page scraper → ESM /youtube/yts. First one that returns results wins. */
export async function ytSearch(query, limit = 5) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Empty search query.');
  const pkg = await viaYtSearchPackage(q, limit);
  if (pkg.length) return pkg;
  let scrapeErr;
  try { return await scrapeSearch(q, limit); } catch (e) { scrapeErr = e; }
  try {
    const { esmYoutubeSearch } = await import('./esm.js');
    return await esmYoutubeSearch(q, limit);
  } catch (esmErr) {
    throw new Error(`${scrapeErr.message} | ESM search: ${esmErr.message}`);
  }
}
