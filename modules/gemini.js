// ─────────────────────────────────────────────
// WRAITH · modules/gemini.js
// .gemini <prompt> — Gemini AI: text, image, or image + text (own caption or replied-to message)
// .scholar <topic/question> — Academic Scholar AI Assistant (text + image aware)
// .photo <prompt> — AI image generator
// ─────────────────────────────────────────────
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { getKey } from '../core/keys.js';
import { fetchBuffer } from '../lib/net.js';
import { sendWithCta } from '../lib/buttons.js';
import { getVar } from '../core/vars.js';

const TEXT_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Unwrap ephemeral / view-once wrappers so we can see the real message node.
function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 4 && cur; i++) {
    const inner = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message ||
      cur.viewOnceMessageV2?.message || cur.documentWithCaptionMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur || {};
}

function getQuotedNode(msg) {
  const m = unwrap(msg.message);
  const ctx = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo || m.documentMessage?.contextInfo;
  return ctx?.quotedMessage ? unwrap(ctx.quotedMessage) : null;
}

function getQuotedText(msg) {
  const qm = getQuotedNode(msg);
  if (!qm) return '';
  return (
    qm.conversation ||
    qm.extendedTextMessage?.text ||
    qm.interactiveMessage?.body?.text ||
    qm.imageMessage?.caption ||
    qm.videoMessage?.caption ||
    ''
  ).trim();
}

function pickImageNode(m) {
  if (!m) return null;
  if (m.imageMessage) return { node: m.imageMessage, mime: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.stickerMessage) return { node: m.stickerMessage, mime: m.stickerMessage.mimetype || 'image/webp', sticker: true };
  const doc = m.documentMessage;
  if (doc && /^image\//.test(doc.mimetype || '')) return { node: doc, mime: doc.mimetype, doc: true };
  return null;
}

/** Image sent with the command (caption) or replied to. Returns { mime, data(base64) } or null. */
async function collectImage(msg) {
  const found = pickImageNode(unwrap(msg.message)) || pickImageNode(getQuotedNode(msg));
  if (!found) return null;
  const size = Number(found.node.fileLength || 0);
  if (size > MAX_IMAGE_BYTES) throw new Error('Image is too large (max 15 MB).');
  const stream = await downloadContentFromMessage(found.node, found.doc ? 'document' : found.sticker ? 'sticker' : 'image');
  const chunks = [];
  let total = 0;
  for await (const c of stream) {
    total += c.length;
    if (total > MAX_IMAGE_BYTES) throw new Error('Image is too large (max 15 MB).');
    chunks.push(c);
  }
  return { mime: found.mime.split(';')[0], data: Buffer.concat(chunks).toString('base64') };
}

function getApiKey() {
  return getVar('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || getKey('GEMINI_API_KEY');
}

async function askGemini(apiKey, parts, systemInstruction) {
  const body = { contents: [{ parts }] };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  let lastErr = '';
  for (const model of TEXT_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) { lastErr = `${model}: HTTP ${res.status}`; continue; }
      const json = await res.json();
      const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (text) return text;
      lastErr = `${model}: ${json?.promptFeedback?.blockReason || json?.candidates?.[0]?.finishReason || 'empty response'}`;
    } catch (e) {
      lastErr = `${model}: ${e.message}`;
      console.warn(`[gemini] ${lastErr}`);
    }
  }
  throw new Error(`Unable to get a Gemini response (${lastErr}). Check your GEMINI_API_KEY.`);
}

async function editOrReply(sock, chat, msg, statusMsg, text) {
  await sock.sendMessage(chat, { text, edit: statusMsg.key }).catch(() =>
    sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {}));
}

// Shared runner for .gemini and .scholar
async function runAi(sock, chat, msg, args, cfg) {
  const userText = (args || []).join(' ').trim();
  const quoted = getQuotedText(msg);
  const hasImageHint = !!(pickImageNode(unwrap(msg.message)) || pickImageNode(getQuotedNode(msg)));

  if (!userText && !quoted && !hasImageHint) {
    return sendWithCta(sock, chat, cfg.usage, { quoted: msg });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return sendWithCta(sock, chat, `❌ *Gemini API Key Required*\n\nSet it with:\n\`.setvar GEMINI_API_KEY <your_key>\``, { quoted: msg });
  }

  const statusMsg = await sock.sendMessage(chat, { text: hasImageHint ? cfg.statusImage : cfg.status }, { quoted: msg });

  try {
    const image = await collectImage(msg);

    let prompt = userText;
    if (quoted) {
      prompt = userText
        ? `${cfg.refLabel}:\n"${quoted}"\n\nRequest: ${userText}`
        : `${cfg.refLabel}:\n"${quoted}"\n\n${cfg.defaultAsk}`;
    } else if (!userText) {
      prompt = image ? cfg.imageOnlyAsk : cfg.defaultAsk;
    }

    const parts = [];
    if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
    parts.push({ text: prompt });

    const answer = await askGemini(apiKey, parts, cfg.system);
    await editOrReply(sock, chat, msg, statusMsg, `${cfg.title}\n\n${answer}\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`);
  } catch (err) {
    console.error(`[${cfg.title}]`, err.message);
    await editOrReply(sock, chat, msg, statusMsg, `❌ *${cfg.failLabel}:* ${err.message}`);
  }
}

/** .gemini <prompt> — text, image, or image + text */
export function geminiCommand(sock, chat, msg, args) {
  return runAi(sock, chat, msg, args, {
    title: '🤖 *Gemini AI*',
    failLabel: 'Gemini AI Failed',
    status: '🤖 *Thinking with Gemini AI…*',
    statusImage: '🤖 *Looking at your image with Gemini AI…*',
    refLabel: 'Reference Message',
    defaultAsk: 'Please summarize or analyze this text.',
    imageOnlyAsk: 'Describe this image in detail and mention anything notable or important in it.',
    usage: `🤖 *Gemini AI Assistant*\n\n• \`.gemini <question>\` — text answer\n• Send an image with caption \`.gemini <question>\` — image + text\n• Reply to an image or message with \`.gemini\` (add a question if you like)\n\nExample: \`.gemini Explain quantum physics simply\``,
  });
}

/** .scholar <topic/question> — Academic Scholar & Professor AI (also reads images) */
export function scholarCommand(sock, chat, msg, args) {
  return runAi(sock, chat, msg, args, {
    title: '🎓 *AI SCHOLAR & PROFESSOR*',
    failLabel: 'Scholar AI Failed',
    status: '🎓 *Scholar AI is analyzing topic…*',
    statusImage: '🎓 *Scholar AI is studying your image…*',
    refLabel: 'Context / Text',
    defaultAsk: 'Please explain this topic systematically.',
    imageOnlyAsk: 'Explain what is shown in this image systematically, as a professor would.',
    usage: `🎓 *AI Scholar & Professor*\n\nUsage: \`.scholar <topic or question>\`\nAlso works with an image (caption or reply).\n\nExample: \`.scholar How do neural networks learn through backpropagation?\``,
    system: `You are an expert university professor and scholar explaining topics to university students.
Always structure your explanation logically:
1. Mental Model / Core Concept First: Provide an intuitive analogy or core principle so the student forms a solid mental framework.
2. Step-by-Step Breakdown: Explain the underlying mechanics and details clearly and concisely.
3. Real-World Application / Key Takeaways: Summarize practical importance and key points.
Keep tone engaging, authoritative yet accessible, and crystal clear.`,
  });
}

/**
 * .photo <prompt> — Generates AI photo/image from prompt
 */
export async function photoCommand(sock, chat, msg, args) {
  const prompt = (args || []).join(' ').trim();

  if (!prompt) {
    return sendWithCta(sock, chat, `📸 *AI Photo Generator*\n\nUsage: \`.photo <image prompt>\`\n\nExample: \`.photo futuristic city with glowing neon skyscrapers at night\``, { quoted: msg });
  }

  const apiKey = getVar('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || getKey('GEMINI_API_KEY');

  const statusMsg = await sock.sendMessage(chat, {
    text: `📸 *Generating AI photo with Gemini…*`
  }, { quoted: msg });

  try {
    let imageBuffer = null;

    // 1. Gemini image models ("Nano Banana"). Names verified against Google docs.
    //    generateContent image models MUST be told to return IMAGE via responseModalities.
    const geminiErrors = [];
    let quotaHit = false;
    if (!apiKey) {
      geminiErrors.push('GEMINI_API_KEY not set (use .setvar GEMINI_API_KEY <key>)');
    } else {
      const imageModels = [
        'gemini-3.1-flash-image',
        'gemini-2.5-flash-image',
        'imagen-4.0-generate-001',
      ];
      for (const model of imageModels) {
        try {
          const isImagen = model.startsWith('imagen-');
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${isImagen ? 'predict' : 'generateContent'}`;
          const bodyPayload = isImagen
            ? { instances: [{ prompt }], parameters: { sampleCount: 1 } }
            : {
                contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
              };

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(bodyPayload),
            signal: AbortSignal.timeout(60000)
          });

          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            let reason = errBody.slice(0, 200);
            try { reason = JSON.parse(errBody)?.error?.message || reason; } catch {}
            geminiErrors.push(`${model}: HTTP ${res.status} ${res.status === 429 ? 'quota/billing (image models are not on the free tier)' : reason.split('\n')[0].slice(0, 120)}`);
            if (res.status === 429) quotaHit = true;
            console.warn(`[photoCommand] ${model} HTTP ${res.status}: ${reason}`);
            continue;
          }

          const json = await res.json();
          // generateContent format (REST returns inlineData; accept snake_case too)
          const parts = json?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            const data = part.inlineData?.data || part.inline_data?.data;
            if (data) { imageBuffer = Buffer.from(data, 'base64'); break; }
          }
          // predict (Imagen) format
          if (!imageBuffer && json?.predictions?.[0]?.bytesBase64Encoded) {
            imageBuffer = Buffer.from(json.predictions[0].bytesBase64Encoded, 'base64');
          }
          if (imageBuffer) { console.log(`[photoCommand] image from ${model}`); break; }

          const why = json?.promptFeedback?.blockReason || json?.candidates?.[0]?.finishReason || 'no image in response';
          geminiErrors.push(`${model}: ${why}`);
          console.warn(`[photoCommand] ${model}: ${why}`);
        } catch (e1) {
          geminiErrors.push(`${model}: ${e1.message}`);
          console.warn(`[photoCommand] ${model} API failed:`, e1.message);
        }
      }
    }

    // 2. Fallbacks when Gemini is unavailable (free-tier quota is 0 for image models)
    const fbErrors = [];
    if (!imageBuffer) {
      const pKey = getKey('POLLINATIONS_API_KEY');
      const keyQ = pKey ? `&key=${encodeURIComponent(pKey)}` : '';
      const q = encodeURIComponent(prompt);
      const fallbackApis = [
        `https://image.pollinations.ai/prompt/${q}?width=1024&height=1024&nologo=true&model=flux${keyQ}`,
        `https://gen.pollinations.ai/image/${q}?model=flux&width=1024&height=1024${keyQ}`,
      ];
      for (const apiUrl of fallbackApis) {
        try {
          const buf = await fetchBuffer(apiUrl, { timeout: 45000 });
          if (buf && buf.length > 2048) { imageBuffer = buf; break; }
          fbErrors.push(`${new URL(apiUrl).host}: empty response`);
        } catch (e) { fbErrors.push(`${new URL(apiUrl).host}: ${e.message}`); }
      }
    }

    // 3. Hugging Face FLUX (free credits) if HF_TOKEN is set in keys.env
    if (!imageBuffer && getKey('HF_TOKEN')) {
      try {
        const r = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
          method: 'POST',
          headers: { Authorization: `Bearer ${getKey('HF_TOKEN')}`, 'Content-Type': 'application/json', Accept: 'image/png' },
          body: JSON.stringify({ inputs: prompt }),
          signal: AbortSignal.timeout(60000)
        });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 2048) imageBuffer = buf;
        } else fbErrors.push(`huggingface: HTTP ${r.status}`);
      } catch (e) { fbErrors.push(`huggingface: ${e.message}`); }
    }

    if (!imageBuffer || imageBuffer.length < 1024) {
      throw new Error(
        (quotaHit
          ? 'Your Gemini API key has NO quota for image models (free tier = 0). Enable billing on the Google AI Studio project, or use a key from a billed project.'
          : 'Could not generate AI photo.') +
        (fbErrors.length ? `\n\nFallbacks failed:\n• ${fbErrors.slice(0, 3).join('\n• ')}` : '') +
        (geminiErrors.length ? `\n\nGemini:\n• ${geminiErrors.slice(0, 3).join('\n• ')}` : '')
      );
    }

    await sock.sendMessage(chat, {
      image: imageBuffer,
      caption: `📸 *AI Photo Generator*\n💬 _${prompt}_\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`
    }, { quoted: msg });

    await sock.sendMessage(chat, {
      text: '✅ *Photo generated successfully!*',
      edit: statusMsg.key
    }).catch(() => {});

  } catch (err) {
    console.error('[photoCommand]', err.message);
    const errText = `❌ *AI Photo Generation Failed:* ${err.message}`;
    await sock.sendMessage(chat, {
      text: errText,
      edit: statusMsg.key
    }).catch(() => {
      sock.sendMessage(chat, { text: errText }, { quoted: msg }).catch(() => {});
    });
  }
}
