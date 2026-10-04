// ─────────────────────────────────────────────
// Al-Jin · lib/esm-secrets.js
// Built-in ESM credentials, stored base64-encoded (same method as
// King's secret.js: Buffer.from(x,'base64').toString('utf8')).
// NOTE: encoding only hides them from casual reading / grep.
// ─────────────────────────────────────────────
const _d = (x) => Buffer.from(x, 'base64').toString('utf8');

const _s = ["N2QzZTZhZjgyNTBjYjRjOTBhNzBlYQ==","NWQ0MDM0OWViYjA4ZDQyZDk4MjY1MQ==","OTE0OTNmYTUxYTIyZjRkMjY2NWY="];
const _k = 'ZnJlZTEwMA==';
const _f = 'MzEyNzYzMjMtMTBlMy00ZjhjLTlmNzMtYzZiMTdiMDRhNjZh';

export const BUILTIN_ESM_SECRET = _d(_s[0]) + _d(_s[1]) + _d(_s[2]);
export const BUILTIN_ESM_API_KEY = _d(_k);
export const BUILTIN_ESM_FP_ID = _d(_f);
