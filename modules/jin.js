// ─────────────────────────────────────────────
// Al-Jin · modules/jin.js
//   .jin <q>            → Kilo free model #1      .jin2 / .jin3 … → next free models
//   .jin create <q>     → image (Pollinations flux)   .jincreate2 → image model #2
//   .gpt .claude .grok .deepseek .kimi <q> → Puter (OpenAI-compatible, needs PUTER_TOKEN)
//   .<ai> models | .<ai> use <model-id>   (owner)
// Dependency-free, no local server: lowest possible RAM.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { kiloChat, kiloFreeModels, puterChat, puterModels, puterConfigured, resolvePuterModel, PUTER_FAMILIES } from '../lib/ai.js';
import { downloadToFile } from '../lib/net.js';
import { getTmpDir } from '../lib/ytdlp.js';
import { isOwner } from '../core/identity.js';
import { setSetting } from '../core/settings.js';

const SYSTEM = 'You are Al-Jin, a concise, friendly WhatsApp assistant. Keep answers short and plain text (light *bold* is fine, no markdown headers or tables).';
const MAX_OUT = 3800;
const COOLDOWN_MS = 4000;
const lastCall = new Map();

const quotedText = (msg) => {
  const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  return (q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || '').trim();
};

function buildPrompt(msg, rest) {
  const own = rest.join(' ').trim();
  const q = quotedText(msg);
  if (own && q) return `${own}\n\n---\nContext (replied message):\n${q.slice(0, 3000)}`;
  return own || q;
}

function cooling(msg) {
  const who = msg.key.participant || msg.key.remoteJid;
  const now = Date.now();
  if (now - (lastCall.get(who) || 0) < COOLDOWN_MS) return true;
  lastCall.set(who, now);
  if (lastCall.size > 200) lastCall.delete(lastCall.keys().next().value);
  return false;
}

const send = (sock, chat, msg, text) => sock.sendMessage(chat, { text: text.slice(0, MAX_OUT) }, { quoted: msg });
const react = (sock, chat, msg, e) => sock.sendMessage(chat, { react: { text: e, key: msg.key } }).catch(() => {});

// ── .jin / .jinN ────────────────────────────────────────────────────────
export async function jinCommand(sock, chat, msg, rest, n = 1) {
  if ((rest[0] || '').toLowerCase() === 'create') return jinCreateCommand(sock, chat, msg, rest.slice(1), n);
  if ((rest[0] || '').toLowerCase() === 'models') {
    const ids = await kiloFreeModels();
    return send(sock, chat, msg, `🧞 *Jin text models*\n\n${ids.slice(0, 8).map((id, i) => `• .jin${i ? i + 1 : ''} → ${id}`).join('\n')}`);
  }
  const prompt = buildPrompt(msg, rest);
  if (!prompt) return send(sock, chat, msg, '🧞 Usage: `.jin <question>`\n`.jin2 <q>` other model · `.jin create <prompt>` image · `.jin models`');
  if (cooling(msg)) return;
  await react(sock, chat, msg, '🧞');
  try {
    const { text, model } = await kiloChat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], n - 1);
    await send(sock, chat, msg, `${text}\n\n_🧞 ${model.replace(':free', '')}_`);
    await react(sock, chat, msg, '☑');
  } catch (e) {
    await send(sock, chat, msg, `⚠️ jin failed: ${e.message}`);
    await react(sock, chat, msg, '❌');
  }
}

// ── image generation ────────────────────────────────────────────────────
// Pollinations anonymous tier: ~1 request / 15 s, so serialise + retry once.
const IMAGE_MODELS = ['flux', 'turbo'];
let imgGate = Promise.resolve();

function pollinationsUrl(prompt, model, seed) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&width=1024&height=1024&nologo=true&seed=${seed}`;
}

export async function jinCreateCommand(sock, chat, msg, rest, n = 1) {
  const prompt = buildPrompt(msg, rest);
  if (!prompt) return send(sock, chat, msg, `🎨 Usage: \`.jin create <prompt>\` (or \`.jincreate2 <prompt>\` for the ${IMAGE_MODELS[1]} model)`);
  if (cooling(msg)) return;
  const model = IMAGE_MODELS[Math.min(n, IMAGE_MODELS.length) - 1];
  await react(sock, chat, msg, '🎨');

  const job = imgGate.then(async () => {
    const dest = path.join(getTmpDir(), `jin_${Date.now()}.jpg`);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await downloadToFile(pollinationsUrl(prompt.slice(0, 600), model, Math.floor(Math.random() * 1e6)), dest, 8 * 1024 * 1024);
          if (fs.existsSync(dest) && fs.statSync(dest).size > 2048) break;
          throw new Error('empty image');
        } catch (e) {
          if (attempt === 1) throw e;
          await new Promise((r) => setTimeout(r, 16000));
        }
      }
      await sock.sendMessage(chat, { image: { url: dest }, caption: `🎨 *${prompt.slice(0, 200)}*\n_model: ${model}_\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧` }, { quoted: msg });
      await react(sock, chat, msg, '☑');
    } finally { try { fs.unlinkSync(dest); } catch {} }
  });
  imgGate = job.catch(() => {});
  try { await job; } catch (e) {
    await send(sock, chat, msg, `⚠️ image failed: ${e.message}\n_The free image tier allows about one image per 15 s — try again shortly._`);
    await react(sock, chat, msg, '❌');
  }
}

// ── Puter families: .gpt .claude .grok .deepseek .kimi ──────────────────
export async function puterAiCommand(sock, chat, msg, rest, family) {
  const sub = (rest[0] || '').toLowerCase();
  const senderIsOwner = msg.key.fromMe || isOwner(msg.key.participant || msg.key.remoteJid);

  if (sub === 'models') {
    if (!puterConfigured()) return send(sock, chat, msg, '⚠️ PUTER_TOKEN missing in keys.env.');
    const ids = (await puterModels()).filter((id) => PUTER_FAMILIES[family].re.test(id));
    const cur = await resolvePuterModel(family);
    return send(sock, chat, msg, `*${family} models* (current: ${cur})\n\n${ids.slice(0, 25).join('\n') || '— none listed —'}\n\nOwner: \`.${family} use <model-id>\``);
  }
  if (sub === 'use') {
    if (!senderIsOwner) return send(sock, chat, msg, '⛔ Owner only.');
    const id = rest[1];
    if (!id) return send(sock, chat, msg, `Usage: \`.${family} use <model-id>\``);
    setSetting(`puter_model_${family}`, id);
    return send(sock, chat, msg, `✅ .${family} now uses *${id}*`);
  }

  const prompt = buildPrompt(msg, rest);
  if (!prompt) return send(sock, chat, msg, `Usage: \`.${family} <question>\` · \`.${family} models\``);
  if (cooling(msg)) return;
  await react(sock, chat, msg, '🤖');
  try {
    const model = await resolvePuterModel(family);
    const r = await puterChat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }]);
    await send(sock, chat, msg, `${r.text}\n\n_🤖 ${r.model}_`);
    await react(sock, chat, msg, '☑');
  } catch (e) {
    await send(sock, chat, msg, `⚠️ ${family} failed: ${e.message}`);
    await react(sock, chat, msg, '❌');
  }
}

export const gptCommand      = (s, c, m, r) => puterAiCommand(s, c, m, r, 'gpt');
export const claudeCommand   = (s, c, m, r) => puterAiCommand(s, c, m, r, 'claude');
export const grokCommand     = (s, c, m, r) => puterAiCommand(s, c, m, r, 'grok');
export const deepseekCommand = (s, c, m, r) => puterAiCommand(s, c, m, r, 'deepseek');
export const kimiCommand     = (s, c, m, r) => puterAiCommand(s, c, m, r, 'kimi');
