// lib/buttons.js — interactive buttons + short-reply fallback engine
import { sendNativeButtons, fixToggleLabel, lowerOnOff } from './native-buttons.js';
import { getReplyMode } from '../core/settings.js';
import { sendPoll, plainTitle, inPollRun } from './poll.js';
import { perSession } from '../core/context.js';

export const NEWSLETTER_JID = '120363409689492071@newsletter';
export const NEWSLETTER_NAME = '𝗔𝗟-𝗝𝗜𝗡';
// -1 = "no specific post": tapping the "Al-Jin" forwarded label just opens the channel.
// (A fake positive id makes WhatsApp say "Update deleted".) If -1 ever misbehaves on your
// WhatsApp version, set AL_JIN_CHANNEL_MSG_ID to the id of a REAL post in the channel.
export const NEWSLETTER_SERVER_ID = Number.isFinite(Number(process.env.AL_JIN_CHANNEL_MSG_ID)) && process.env.AL_JIN_CHANNEL_MSG_ID !== undefined && process.env.AL_JIN_CHANNEL_MSG_ID !== ''
  ? Number(process.env.AL_JIN_CHANNEL_MSG_ID) : -1;

// "Forwarded from channel" look. Always returns a FRESH object (Baileys mutates
// contextInfo while building a message, so a shared constant would leak between sends).
// Pass an existing contextInfo (mentions, etc.) and it is kept — only the
// forward fields are added.
export function newsletterContext(base = {}) {
  const b = (base && typeof base === 'object') ? base : {};
  return {
    ...b,
    isForwarded: true,
    forwardingScore: b.forwardingScore || 1,
    forwardedNewsletterMessageInfo: b.forwardedNewsletterMessageInfo || {
      newsletterJid: NEWSLETTER_JID,
      newsletterName: NEWSLETTER_NAME,
      serverMessageId: NEWSLETTER_SERVER_ID,
      contentType: 1,
    },
  };
}

// Kept so older imports never break. Prefer newsletterContext() (fresh object per message).
export const NEWSLETTER_CONTEXT = Object.freeze(newsletterContext());

const pendingChoices = perSession(() => new Map());
const PENDING_TTL_MS = 2 * 60 * 1000;
// Every button message we send keeps its own choices for a while, so a tap that reaches us as plain
// text ("Reads ON" quoting the menu) is still understood — even on an older menu or after other messages.
const sentMenus = perSession(() => new Map());
const MENU_TTL_MS = 30 * 60 * 1000;
const MENU_MAX = 200;

function keywordsFrom(id = '', display = '') {
  const words = new Set();
  for (const src of [id, display]) {
    for (const w of String(src).toLowerCase().split(/[^a-z0-9]+/)) {
      if (w && w.length >= 2 && w.length <= 12) words.add(w);
    }
  }
  for (const stop of ['ghost','peek','lurk','auto','cmd','command','btn','button']) words.delete(stop);
  return [...words];
}

// One source of truth for text mode: the numbered choices that are shown to the
// user AND the ones registered for "reply with a number" use the same list.
// Link / copy / call buttons are never numbered, so replies like "1" or "chat"
// are no longer swallowed by buttons that were never displayed as options.
function collectChoices(buttons = []) {
  const choices = [];
  const extras = [];
  let num = 1;
  for (const b of buttons || []) {
    let p = {};
    try { p = JSON.parse(b?.buttonParamsJson || '{}'); } catch { continue; }
    switch (b?.name) {
      case 'quick_reply':
        if (p.display_text) choices.push({ num: String(num++), label: p.display_text, id: p.id || p.display_text });
        break;
      case 'single_select':
        for (const sec of p.sections || []) {
          const rows = [];
          for (const row of sec.rows || []) {
            if (!row?.title) continue;
            rows.push({ num: String(num++), label: row.title, desc: row.description || '', id: row.id || row.title, tag: row.highlight_label || '' });
          }
          if (rows.length) choices.push({ heading: p.title || '', section: sec.title || '', rows });
        }
        break;
      case 'cta_url': if (p.url) extras.push({ icon: '🔗', label: p.display_text, value: p.url }); break;
      case 'cta_copy': if (p.copy_code) extras.push({ icon: '📋', label: p.display_text, value: p.copy_code, copy: true }); break;
      case 'cta_call': if (p.phone_number) extras.push({ icon: '📞', label: p.display_text, value: p.phone_number }); break;
      case 'open_webview': if (p.link) extras.push({ icon: '🌐', label: p.title, value: p.link }); break;
      case 'send_location': extras.push({ note: '📍 Share your location: tap 📎 Attach → Location.' }); break;
      default: break;
    }
  }
  return { choices, extras };
}

function flatChoices(choices) {
  const flat = [];
  for (const c of choices) {
    if (c.rows) flat.push(...c.rows); else flat.push(c);
  }
  return flat;
}

export function registerChoices(chatJid, senderJid, buttons = []) {
  const flat = flatChoices(collectChoices(buttons).choices).map((c) => ({
    num: c.num,
    id: c.id,
    label: String(c.label || '').trim().toLowerCase(),
    keywords: keywordsFrom(c.id, c.label),
  }));
  if (!flat.length) { pendingChoices.delete(chatJid); return; }
  pendingChoices.set(chatJid, { sender: senderJid, exp: Date.now() + PENDING_TTL_MS, choices: flat });
}

export function clearChoices(chatJid) {
  pendingChoices.delete(chatJid);
}

const sentCtas = perSession(() => new Map());

function rememberMenu(msgId, buttons = []) {
  if (!msgId) return;
  const flat = flatChoices(collectChoices(buttons).choices).map((c) => ({
    num: c.num, id: c.id, label: String(c.label || '').trim().toLowerCase(),
  }));
  const ctas = ctasFrom(buttons);
  if (ctas.length) {
    sentCtas.set(msgId, { exp: Date.now() + MENU_TTL_MS, ctas, hasChoices: flat.length > 0 });
    while (sentCtas.size > MENU_MAX) sentCtas.delete(sentCtas.keys().next().value);
  }
  if (!flat.length) return;
  sentMenus.set(msgId, { exp: Date.now() + MENU_TTL_MS, choices: flat });
  while (sentMenus.size > MENU_MAX) sentMenus.delete(sentMenus.keys().next().value);
}

// ── Link / copy / call buttons ("CTA") ─────────────────────────────────────────────────────────
// WhatsApp opens / copies / dials these on the phone, but some clients (and linked-device senders) report a
// tap back to us as a plain reply — the button label, quoting the message — and nothing was done.
// So a reply to a CTA message (button label, or its number) now performs the button's action:
// copy → the code in its own message, link → the link, call → the number.
function ctasFrom(buttons = []) {
  const out = [];
  for (const b of buttons || []) {
    let p = {};
    try { p = JSON.parse(b?.buttonParamsJson || '{}'); } catch { continue; }
    switch (b?.name) {
      case 'cta_copy': if (p.copy_code) out.push({ type: 'copy', label: String(p.display_text || 'Copy code'), value: String(p.copy_code) }); break;
      case 'cta_url': if (p.url) out.push({ type: 'url', label: String(p.display_text || 'Open link'), value: String(p.url) }); break;
      case 'open_webview': if (p.link) out.push({ type: 'url', label: String(p.title || 'Open link'), value: String(p.link) }); break;
      case 'cta_call': if (p.phone_number) out.push({ type: 'call', label: String(p.display_text || 'Call'), value: String(p.phone_number) }); break;
      default: break;
    }
  }
  return out;
}

// Case, emoji and punctuation do not matter: "Online OFF", "online off" and "Online off!" are the same tap.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// The reply carries a copy of the menu it answers (contextInfo.quotedMessage), including every button.
// Reading the choices from THAT copy needs no memory at all — it works for old menus and after restarts.
function buttonsFromQuoted(quoted) {
  let m = quoted;
  for (let i = 0; i < 4 && m; i++) {
    if (m.interactiveMessage) break;
    m = m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.ephemeralMessage?.message
      || m.documentWithCaptionMessage?.message || null;
  }
  const buttons = m?.interactiveMessage?.nativeFlowMessage?.buttons;
  return Array.isArray(buttons) ? buttons : [];
}

function choicesFromQuoted(quoted) {
  const buttons = buttonsFromQuoted(quoted);
  if (!buttons.length) return [];
  return flatChoices(collectChoices(buttons).choices).map((c) => ({ num: c.num, id: c.id, label: norm(c.label) }));
}

export function matchQuotedChoice(quotedMessage, text = '') {
  const t = norm(text);
  if (!t || t.length > 60 || !quotedMessage) return null;
  const choices = choicesFromQuoted(quotedMessage);
  if (!choices.length) return null;
  const hit = choices.find((c) => c.label && c.label === t)
    || (/^\d{1,2}$/.test(t) ? choices.find((c) => c.num === t) : null);
  return hit ? hit.id : null;
}

// quotedId = id of the message the user replied to / tapped on (when there is one).
export function matchChoice(chatJid, senderJid, text = '', quotedId = null, quotedMessage = null) {
  const t = norm(text);
  if (!t || t.length > 60) return null;

  // 0) the menu that was replied to, read from the reply itself
  const fromQuote = matchQuotedChoice(quotedMessage, text);
  if (fromQuote) return fromQuote;

  // 1) the exact menu that was replied to: the button label, or its number
  if (quotedId) {
    const menu = sentMenus.get(quotedId);
    if (menu && Date.now() <= menu.exp) {
      const hit = menu.choices.find((c) => c.label && norm(c.label) === t)
        || (/^\d{1,2}$/.test(t) ? menu.choices.find((c) => c.num === t) : null);
      if (hit) return hit.id;
    } else if (menu) sentMenus.delete(quotedId);
  }

  // 2) the latest menu in this chat (text / poll mode, or a menu we no longer have by id)
  const rec = pendingChoices.get(chatJid);
  if (!rec) return null;
  if (Date.now() > rec.exp) { pendingChoices.delete(chatJid); return null; }
  let hit = null;
  if (/^\d{1,2}$/.test(t)) hit = rec.choices.find(c => c.num === t);
  if (!hit) hit = rec.choices.find(c => c.label && norm(c.label) === t);
  if (!hit && t.length <= 24) hit = rec.choices.find(c => c.keywords.length && c.keywords.some(k => t === k));
  if (!hit) return null;
  pendingChoices.delete(chatJid);
  return hit.id;
}

// Reply (quoting a message with link / copy / call buttons) with a button's label or number → that CTA.
// Numbers count the CTA buttons only when the message has no quick-reply / list choices (those own the numbers).
export function matchQuotedCta(quotedMessage, text = '', quotedId = null) {
  const t = norm(text);
  if (!t || t.length > 60) return null;
  let ctas = []; let hasChoices = false;
  const buttons = buttonsFromQuoted(quotedMessage);
  if (buttons.length) {
    ctas = ctasFrom(buttons);
    hasChoices = flatChoices(collectChoices(buttons).choices).length > 0;
  } else if (quotedId) {
    const rec = sentCtas.get(quotedId);
    if (rec && Date.now() <= rec.exp) { ctas = rec.ctas; hasChoices = rec.hasChoices; }
    else if (rec) sentCtas.delete(quotedId);
  }
  if (!ctas.length) return null;
  const byLabel = ctas.find((c) => norm(c.label) === t);
  if (byLabel) return byLabel;
  if (!hasChoices && /^\d{1,2}$/.test(t)) return ctas[Number(t) - 1] || null;
  return null;
}

// What the bot sends when a CTA is chosen.
export function ctaReplyText(cta) {
  if (!cta) return '';
  const label = String(cta.label || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || cta.label;   // the icon below replaces a leading emoji
  if (cta.type === 'copy') return `📋 *${label}*\n\n\`\`\`${cta.value}\`\`\`\n_Tap and hold the code to copy it._`;
  if (cta.type === 'call') return `📞 *${label}*\n${cta.value}`;
  return `🔗 *${label}*\n${cta.value}`;
}

// A CTA tap that WhatsApp delivers as an interactive response (name cta_copy / cta_url / cta_call).
export function ctaFromInteractiveResponse(msg) {
  const m = msg?.message;
  if (!m) return null;
  const r = m.interactiveResponseMessage
    || m.viewOnceMessage?.message?.interactiveResponseMessage
    || m.ephemeralMessage?.message?.interactiveResponseMessage
    || m.documentWithCaptionMessage?.message?.interactiveResponseMessage;
  const flow = r?.nativeFlowResponseMessage;
  if (!flow || !['cta_copy', 'cta_url', 'cta_call'].includes(flow.name)) return null;
  let p = {};
  try { p = JSON.parse(flow.paramsJson || '{}'); } catch { return null; }
  if (flow.name === 'cta_copy') {
    const v = p.copy_code || p.code;
    return v ? { type: 'copy', label: String(p.display_text || 'Copy code'), value: String(v) } : null;
  }
  if (flow.name === 'cta_url') {
    const v = p.url || p.link;
    return v ? { type: 'url', label: String(p.display_text || 'Open link'), value: String(v) } : null;
  }
  const v = p.phone_number || p.phone;
  return v ? { type: 'call', label: String(p.display_text || 'Call'), value: String(v) } : null;
}

export function createQuickReply(displayText, id) {
  // on/off is always lower-case ("Online off") so the tap text matches the command words exactly
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: lowerOnOff(displayText), id }) };
}
export function createCtaUrl(displayText, url, merchantUrl) {
  return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: merchantUrl || url }) };
}
export function createCtaCopy(displayText, copyCode) {
  return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: displayText, copy_code: copyCode }) };
}
export function createCtaCall(displayText, phoneNumber) {
  return { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: displayText, phone_number: phoneNumber }) };
}
export function createCtaCatalog(businessPhoneNumber) {
  return { name: 'cta_catalog', buttonParamsJson: JSON.stringify({ business_phone_number: businessPhoneNumber }) };
}
export function createSingleSelect(title, sections) {
  return { name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) };
}
export function createOpenWebview(title, link) {
  return { name: 'open_webview', buttonParamsJson: JSON.stringify({ title, link }) };
}
export function createLocationRequest(displayText = 'Share Location') {
  return { name: 'send_location', buttonParamsJson: JSON.stringify({ display_text: displayText }) };
}
export function createAddressRequest(displayText = 'Share Address') {
  return { name: 'address_message', buttonParamsJson: JSON.stringify({ display_text: displayText }) };
}
export function createReminder(displayText = 'Remind Me') {
  return { name: 'cta_reminder', buttonParamsJson: JSON.stringify({ display_text: displayText }) };
}

export const DEFAULT_CTA_BUTTONS = [
  createCtaUrl('CHAT WITH OWNER', 'https://wa.me/923257853673?text=al-jin'),
  createCtaUrl('FOLLOW CHANNEL', 'https://whatsapp.com/channel/0029VbDSqdOFy72BrpK1I40c'),
];

export async function sendWithCta(sock, jid, text, opts = {}) {
  return sendInteractive(sock, jid, {
    body: text,
    footer: opts.footer || '',
    header: opts.header || '',
    buttons: opts.buttons || DEFAULT_CTA_BUTTONS,
    image: opts.image,
    video: opts.video,
    document: opts.document,
  }, opts);
}

export function extractInteractiveResponse(msg) {
  if (!msg?.message) return null;
  const m = msg.message;
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.interactiveResponseMessage) {
    const flowReply = m.interactiveResponseMessage.nativeFlowResponseMessage;
    if (flowReply) {
      try { const p = JSON.parse(flowReply.paramsJson || '{}'); if (p.id) return p.id; } catch {}
    }
    const btnReply = m.interactiveResponseMessage.buttonsResponseMessage;
    if (btnReply?.selectedButtonId) return btnReply.selectedButtonId;
  }
  const inner = m.viewOnceMessage?.message?.interactiveResponseMessage
    || m.ephemeralMessage?.message?.interactiveResponseMessage
    || m.documentWithCaptionMessage?.message?.interactiveResponseMessage;
  if (inner?.nativeFlowResponseMessage) {
    try { const p = JSON.parse(inner.nativeFlowResponseMessage.paramsJson || '{}'); if (p.id) return p.id; } catch {}
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
  return null;
}

function normalizeButtons(buttons = []) {
  return (buttons || []).map(b => {
    if (typeof b === 'object' && b?.buttonParamsJson) return fixToggleLabel(b);
    if (b?.quickReply) return createQuickReply(b.quickReply.displayText, b.quickReply.id);
    return b;
  }).filter(Boolean);
}

export async function sendInteractive(sock, jid, options = {}, opts = {}) {
  const { body = '', footer = '', header = '', buttons = [], image, video, document, mentions } = options;
  const normalizedButtons = normalizeButtons(buttons);
  const senderOf = opts.quoted?.key?.participant || opts.quoted?.key?.remoteJid || opts.sender || jid;
  if (!inPollRun()) registerChoices(jid, senderOf, normalizedButtons);   // a vote must not replace the open poll's numbers

  const mode = getReplyMode();
  // Reply mode "list": one "Select option" button that opens a list menu. Messages with nothing to pick
  // (only link / copy buttons) go on as normal native buttons below.
  if (!opts.forceButtons && mode === 'list' && !inPollRun()) {
    try {
      const sentList = await sendListMode(sock, jid, { body, footer, header, buttons: normalizedButtons, image, video, document, mentions }, opts);
      if (sentList) return sentList;
    } catch (e) {
      try { console.warn('[sendInteractive] list menu failed:', e?.message || e); } catch {}
      return sendFallbackText(sock, jid, { body, footer, header, buttons: normalizedButtons, image, video, document }, opts);
    }
  }
  // opts.forceButtons: messages where a one-tap button is the whole point (copy code / link),
  // sent as real buttons even in text or poll reply mode. If buttons fail they fall back to text.
  if (!opts.forceButtons && (mode === 'text' || mode === 'poll' || inPollRun())) {
    return sendFallbackText(sock, jid, { body, footer, header, buttons: normalizedButtons, image, video, document }, opts);
  }

  // 1. our own native-flow buttons (lib/native-buttons.js)
  try {
    const sentMsg = await sendNativeButtons(sock, jid, {
      body, footer, header,
      buttons: normalizedButtons,
      contextInfo: newsletterContext(),
      image, video, document,
    }, { quoted: opts.quoted });
    try { rememberMenu(sentMsg?.key?.id, normalizedButtons); } catch {}
    return sentMsg;
  } catch (e) {
    try { console.warn('[sendInteractive] native buttons failed:', e?.message || e); } catch {}
  }

  // 2. text fallback — always works
  return sendFallbackText(sock, jid, { body, footer, header, buttons: normalizedButtons, image, video, document }, opts);
}

// List reply mode: every choice (quick replies and list rows) becomes a row of ONE list menu that opens from a
// "Select option" button. Picking a row comes back as an interactive response (its id) or as the row title
// quoting the menu — both are understood by the same matching as every other menu. Link / copy / call buttons
// a command added stay real buttons next to the list button.
const LIST_ROWS_PER_SECTION = 10;
const LIST_MAX_ROWS = 100;
const clipTo = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

async function sendListMode(sock, jid, options, opts) {
  const { body = '', footer = '', header = '', image, video, document, mentions } = options;
  const { choices, extras } = collectChoices(options.buttons);
  const flat = flatChoices(choices);
  if (!flat.length || flat.length > LIST_MAX_ROWS) return null;

  const row = (r) => {
    const label = String(r.label || '').trim();
    const title = clipTo(label, 24);
    return {
      title, description: clipTo(title !== label ? (r.desc ? `${label} · ${r.desc}` : label) : (r.desc || ''), 72), id: r.id,
      ...(r.tag ? { highlight_label: clipTo(r.tag, 20) } : {}),
    };
  };
  const sections = [];
  const addSection = (name, rows) => {
    for (let i = 0; i < rows.length; i += LIST_ROWS_PER_SECTION) {
      const part = rows.slice(i, i + LIST_ROWS_PER_SECTION);
      const suffix = rows.length > LIST_ROWS_PER_SECTION ? ` (${i + 1}-${i + part.length})` : '';
      sections.push({ title: clipTo(`${name}${suffix}`, 24), rows: part.map(row) });
    }
  };
  let loose = [];
  const flushLoose = () => { if (loose.length) addSection('Options', loose); loose = []; };
  for (const c of choices) {
    if (c.rows) { flushLoose(); addSection(c.section || 'Options', c.rows); } else loose.push(c);
  }
  flushLoose();

  const listTitle = clipTo(choices.find((c) => c.rows && c.heading)?.heading || 'Select option', 20);
  const listButton = createSingleSelect(listTitle, sections);

  // Link / copy / call buttons a command added on purpose stay real buttons beside the list button
  // (not the generic "chat with owner / follow channel" pair, which text mode doesn't add either).
  const generic = new Set(DEFAULT_CTA_BUTTONS.map((b) => b.buttonParamsJson));
  const keep = (options.buttons || []).filter((b) => b?.name && b.name !== 'quick_reply' && b.name !== 'single_select'
    && !generic.has(b.buttonParamsJson) && /^(cta_url|cta_copy|cta_call|open_webview)$/.test(b.name));
  const sendButtons = [...keep, listButton];

  const sentMsg = await sendNativeButtons(sock, jid, {
    body, footer, header,
    buttons: sendButtons,
    contextInfo: newsletterContext(mentions && mentions.length ? { mentionedJid: mentions } : {}),
    image, video, document,
  }, { quoted: opts?.quoted });
  try { rememberMenu(sentMsg?.key?.id, sendButtons); } catch {}
  return sentMsg;
}

// Plain-text rendering (reply mode "text"):
//   *Header*            (if any)
//   body
//   numbered options    (quick replies / list rows) + one-line reply hint
//   explicit links      (🔗 / 📋 / 📞) — only buttons a command added on purpose;
//                       the generic "chat with owner / follow channel" buttons are
//                       NOT appended to every reply, and a link already present in
//                       the body is not repeated.
//   _footer_
export function renderTextMode({ body = '', footer = '', header = '', buttons = [] } = {}) {
  const { choices, extras } = collectChoices(normalizeButtons(buttons));
  const defaultUrls = new Set(DEFAULT_CTA_BUTTONS.map((b) => { try { return JSON.parse(b.buttonParamsJson).url; } catch { return ''; } }));
  const parts = [];
  if (header) parts.push(`*${header}*`);
  if (body) parts.push(body);

  if (choices.length) {
    const lines = [];
    for (const c of choices) {
      if (c.rows) {
        if (c.heading) lines.push(`📋 *${c.heading}*`);
        if (c.section) lines.push(`── ${c.section} ──`);
        for (const r of c.rows) lines.push(`${r.num}. ${r.label}${r.desc ? ` — ${r.desc}` : ''}`);
      } else {
        lines.push(`${c.num}. ${c.label}`);
      }
    }
    lines.push('', '_Reply with the number or option name._');
    parts.push(lines.join('\n'));
  }

  const links = [];
  for (const e of extras) {
    if (e.note) { links.push(e.note); continue; }
    if (defaultUrls.has(e.value)) continue;
    if (body.includes(e.value)) continue;
    if (e.copy && String(e.value).length > 300) continue;
    links.push(`${e.icon} ${e.label ? `${e.label}: ` : ''}${e.value}`);
  }
  if (links.length) parts.push(links.join('\n'));
  if (footer) parts.push(`_${footer}_`);
  return parts.join('\n\n');
}

// Poll reply mode: body (+ current settings) is the poll question, every choice is an
// option. Returns null when a poll isn't possible (needs 2–12 choices) → text fallback.
async function sendPollMode(sock, jid, options, opts) {
  const { body = '', header = '', image, video, document } = options;
  const { choices, extras } = collectChoices(options.buttons);
  const flat = flatChoices(choices);
  if (flat.length < 2 || flat.length > 12) return null;

  const quoted = opts?.quoted;
  const question = plainTitle([header, body].filter(Boolean).join('\n\n'));
  const media = image ? { image } : video ? { video } : document
    ? { document, mimetype: document.mimetype || 'application/octet-stream', fileName: document.fileName || 'file' }
    : null;

  let title = question;
  if (media || question.length > 240) {
    // Too long for a poll title (or has media): send it normally, poll just asks.
    const text = renderTextMode({ ...options, buttons: [] });
    if (media) await sock.sendMessage(jid, { ...media, caption: text.length <= 1000 ? text : undefined }, { quoted });
    if (!media || text.length > 1000) await sock.sendMessage(jid, { text, contextInfo: newsletterContext() }, { quoted });
    title = 'Select an option 👇';
  }

  const sent = await sendPoll(sock, jid, {
    title,
    options: flat.map((c) => ({ label: c.label, id: c.id })),
  }, { quoted, onExpire: () => clearChoices(jid) });
  if (!sent) return null;

  const defaultUrls = new Set(DEFAULT_CTA_BUTTONS.map((b) => { try { return JSON.parse(b.buttonParamsJson).url; } catch { return ''; } }));
  const links = extras
    .filter((e) => !e.note && !defaultUrls.has(e.value) && !body.includes(e.value) && !(e.copy && String(e.value).length > 300))
    .map((e) => `${e.icon} ${e.label ? `${e.label}: ` : ''}${e.value}`);
  if (links.length) { try { await sock.sendMessage(jid, { text: links.join('\n') }); } catch {} }
  return sent;
}

async function sendFallbackText(sock, jid, options, opts) {
  // A command started by a poll vote answers in plain text: the open poll stays,
  // no new poll is created, and the choices are not repeated.
  if (inPollRun()) {
    options = {
      ...options,
      buttons: (options.buttons || []).filter((b) => b?.name !== 'quick_reply' && b?.name !== 'single_select'),
    };
  } else if (getReplyMode() === 'poll') {
    try {
      const sent = await sendPollMode(sock, jid, options, opts);
      if (sent) return sent;
    } catch (e) { console.error('[buttons] poll mode failed, using text:', e.message); }
  }
  const { image, video, document } = options;
  const text = renderTextMode(options);
  const quoted = opts?.quoted;

  // Media that a command attached to a "button message" must not be lost in text mode.
  const media = image ? { image } : video ? { video } : document
    ? { document, mimetype: document.mimetype || 'application/octet-stream', fileName: document.fileName || 'file' }
    : null;
  if (media) {
    if (text.length <= 1000) {
      return sock.sendMessage(jid, { ...media, caption: text }, { quoted });
    }
    await sock.sendMessage(jid, media, { quoted });
  }
  return sock.sendMessage(jid, { text, contextInfo: newsletterContext() }, { quoted });
}
