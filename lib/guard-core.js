// ─────────────────────────────────────────────
//  Al-Jin · lib/guard-core.js
//  Pure helpers for modules/x-guard.js (no Baileys, no I/O → unit-testable).
//  · duration parsing   · punishment ladder (delete / warn / kick / tkick)
//  · forwarded-message detection   · timed-mute matching
// ─────────────────────────────────────────────

export const ACTIONS = ['delete', 'warn', 'kick', 'tkick'];
export const TKICK_DEFAULT = 60 * 60 * 1000;      // 1 h
export const TKICK_MIN = 60 * 1000;               // 1 min
export const TKICK_MAX = 30 * 24 * 60 * 60 * 1000; // 30 d

const UNIT = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** "30s" "10m" "2h" "1d" "1w" → milliseconds, or null when it is not a duration. */
export function parseDuration(token) {
    const m = /^(\d{1,4})\s*(s|m|h|d|w)$/i.exec(String(token ?? '').trim());
    if (!m) return null;
    const ms = Number(m[1]) * UNIT[m[2].toLowerCase()];
    return ms > 0 ? ms : null;
}

/** 90000 → "1m 30s" · 3600000 → "1h" · 45000 → "45s" */
export function fmtMs(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && r && `${r}s`].filter(Boolean);
    return parts.join(' ');
}

export const clampMs = (ms, lo, hi) => Math.min(hi, Math.max(lo, ms));

/** Forwarded flag as WhatsApp sets it on contextInfo. */
export function isForwarded(ctx) {
    return !!ctx && (ctx.isForwarded === true || Number(ctx.forwardingScore) > 0);
}

/**
 * Old Al-Jin antiword used action "kick" to mean "strikes, then kick".
 * In the new ladder that is "warn"; "kick" now means kick immediately.
 * Runs once per stored node (marked with v2).
 */
export function migrateAction(node) {
    if (!node) return node;
    if (!node.v2) {
        if (node.action === 'kick') node.action = 'warn';
        node.v2 = true;
    }
    if (!ACTIONS.includes(node.action)) node.action = 'delete';
    return node;
}

/** Adds a strike for `key`. Returns how many are left and whether the limit was reached (counter then resets). */
export function addStrike(node, key) {
    node.strikes ||= {};
    const limit = Math.max(1, Number(node.limit) || 3);
    node.strikes[key] = (node.strikes[key] || 0) + 1;
    const left = limit - node.strikes[key];
    if (left <= 0) { node.strikes[key] = 0; return { left: 0, limit, reached: true }; }
    return { left, limit, reached: false };
}

export function describeAction(node) {
    const a = ACTIONS.includes(node?.action) ? node.action : 'delete';
    const limit = Number(node?.limit) || 3;
    if (a === 'warn') return `warn (${limit} strikes → kick)`;
    if (a === 'tkick') return `tkick (${fmtMs(node?.tkickMs || TKICK_DEFAULT)})`;
    return a;
}

/**
 * Handles ".<cmd> action …" and ".<cmd> limit …" for any protection node.
 * @returns {{ok?:string, err?:string}|null} null when `sub` is neither.
 */
export function actionSub(sub, args, node, prefixCmd) {
    if (sub === 'action') {
        const v = String(args[1] || '').toLowerCase();
        if (!ACTIONS.includes(v)) return { err: `Usage: \`${prefixCmd} action delete|warn|kick|tkick [duration]\`` };
        node.action = v;
        node.v2 = true;
        if (v === 'tkick') {
            if (args[2]) {
                const ms = parseDuration(args[2]);
                if (!ms) return { err: 'Duration looks like 30m, 2h, 1d (1 minute – 30 days).' };
                node.tkickMs = clampMs(ms, TKICK_MIN, TKICK_MAX);
            } else node.tkickMs ||= TKICK_DEFAULT;
        }
        return { ok: `⚙️ action: *${describeAction(node)}*` };
    }
    if (sub === 'limit') {
        const n = parseInt(args[1], 10);
        if (!(n >= 1 && n <= 10)) return { err: `Usage: \`${prefixCmd} limit 1-10\`` };
        node.limit = n;
        return { ok: `⚙️ strike limit: *${n}*` };
    }
    return null;
}

/**
 * Finds an active/expired timed-mute for any of the sender's number forms.
 * mutes: { [key]: { ids: string[], until: number (0 = until unmuted) } }
 */
export function matchMute(mutes, senderDigits, now = Date.now()) {
    if (!mutes) return null;
    for (const [key, rec] of Object.entries(mutes)) {
        const ids = rec?.ids || [key];
        if (!ids.some((d) => senderDigits.includes(d))) continue;
        return { key, rec, expired: !!rec.until && rec.until <= now };
    }
    return null;
}
