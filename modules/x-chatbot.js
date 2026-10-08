// ─────────────────────────────────────────────
//  Al-Jin · modules/x-chatbot.js
//  .bot <question>  (alias .chatbot)  — fast AI chat with a short memory per chat.
//  Models: fastest free Groq model first (rotates to the next when one is rate-limited)
//          → Gemini (if GEMINI_API_KEY) → keyless free GPT.      .bot reset  forgets the conversation.
// ─────────────────────────────────────────────
import { reply, safe, quotedOf, textOfMessage, senderJid, isGroup } from '../lib/x.js';
import { getPrefix } from '../core/settings.js';
import { smartChat } from '../lib/llm.js';

const SYSTEM = 'You are Al-Jin, a smart, friendly and quick WhatsApp assistant. Always answer in the same language and script the user writes in '
  + '(Roman Urdu stays Roman Urdu, Urdu script stays Urdu script, English stays English). Be concise — usually under 120 words unless the user asks for detail. '
  + 'Use WhatsApp formatting only (*bold*, _italic_, short lists); no markdown headings or tables. Be honest when you are not sure.';

const MAX_TURNS = 8;                       // messages kept per conversation
const TTL_MS = 30 * 60_000;
const memory = new Map();                  // key → { at, msgs }

const keyOf = (chat, msg) => (isGroup(chat) ? `${chat}:${senderJid(msg)}` : chat);
function sweep() { const now = Date.now(); for (const [k, v] of memory) if (now - v.at > TTL_MS) memory.delete(k); }

export const bot = safe('bot', async (sock, chat, msg, args) => {
  const p = getPrefix();
  const typed = (args || []).join(' ').trim();
  const key = keyOf(chat, msg);

  if (/^(reset|clear|new|forget)$/i.test(typed)) {
    memory.delete(key);
    return reply(sock, chat, msg, '🧹 Fresh start — I forgot our chat.');
  }
  let quoted = '';
  try { quoted = textOfMessage(quotedOf(msg)?.message) || ''; } catch {}
  if (!typed && !quoted) {
    return reply(sock, chat, msg, `🤖 *Al-Jin AI*\nAsk anything: \`${p}bot what is photosynthesis?\`\nReply to any message with \`${p}bot\` to ask about it · \`${p}bot reset\` clears the memory.`);
  }
  const prompt = typed && quoted ? `${typed}\n\n(Replying to this message:\n${quoted.slice(0, 1500)})` : (typed || quoted);

  sweep();
  const mem = memory.get(key) || { at: 0, msgs: [] };
  try { await sock.sendPresenceUpdate('composing', chat); } catch {}
  let res;
  try {
    res = await smartChat([{ role: 'system', content: SYSTEM }, ...mem.msgs, { role: 'user', content: prompt.slice(0, 4000) }], { purpose: 'fast', maxTokens: 1200, temperature: 0.6 });
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', chat); } catch {}
    return reply(sock, chat, msg, `⚠️ All AI engines are busy right now.\n${String(e.message).slice(0, 300)}\n\nTip: add a free key — \`${p}setvar GROQ_API_KEY <key>\` (console.groq.com).`);
  }
  try { await sock.sendPresenceUpdate('paused', chat); } catch {}
  mem.msgs.push({ role: 'user', content: prompt.slice(0, 2000) }, { role: 'assistant', content: res.text.slice(0, 2000) });
  mem.msgs = mem.msgs.slice(-MAX_TURNS);
  mem.at = Date.now();
  memory.set(key, mem);
  return reply(sock, chat, msg, `${res.text}\n\n_⚡ ${res.model} · ${res.provider}_`);
});
