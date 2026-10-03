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
    const res = await fetch(`${ESM_BASE}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    if (setCookie && setCookie.length) {
      cachedCookies = setCookie.map((c) => c ? c.split(';')[0] : '').filter(Boolean).join('; ');
      lastCookieFetch = Date.now();
    }
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
