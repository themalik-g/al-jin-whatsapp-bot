// ─────────────────────────────────────────────
// Al-Jin · lib/esm.js
// Helper for interacting with https://esm.apiis.dpdns.org/
// ─────────────────────────────────────────────
import { getKey } from '../core/keys.js';

const ESM_BASE = 'https://esm.apiis.dpdns.org';
let cachedCookies = '';
let lastCookieFetch = 0;

export function getEsmApiKey() {
  return getKey('ESM_API_KEY') || 'free100';
}

async function ensureCookies() {
  if (cachedCookies && (Date.now() - lastCookieFetch < 10 * 60 * 1000)) {
    return cachedCookies;
  }
  try {
    const cookieMap = {};
    const extractCookies = (res) => {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
      for (const c of raw) {
        if (!c) continue;
        const part = c.split(';')[0];
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
          cookieMap[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
        }
      }
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // 1. Visit root page
    const resRoot = await fetch(`${ESM_BASE}/`, { headers });
    extractCookies(resRoot);

    // 2. Visit /r endpoint (required by server session tracker)
    const currentCookie = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
    const resR = await fetch(`${ESM_BASE}/r`, {
      headers: {
        ...headers,
        'Referer': `${ESM_BASE}/`,
        ...(currentCookie ? { 'Cookie': currentCookie } : {}),
      },
    });
    extractCookies(resR);

    cachedCookies = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
    lastCookieFetch = Date.now();
  } catch (e) {
    console.warn('[esm] cookie fetch failed:', e.message);
  }
  return cachedCookies;
}

export async function fetchEsmApi(endpoint, params = {}) {
  const cookies = await ensureCookies();
  const apiKey = getEsmApiKey();
  const urlObj = new URL(endpoint.startsWith('http') ? endpoint : `${ESM_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);

  if (!urlObj.searchParams.has('apikey')) {
    urlObj.searchParams.set('apikey', apiKey);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      urlObj.searchParams.set(k, v);
    }
  }

  const fpId = '12345678-1234-4234-8234-123456789abc';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': `${ESM_BASE}/`,
    'Origin': ESM_BASE,
    'X-FP-ID': fpId,
  };
  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const res = await fetch(urlObj.toString(), { headers });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
