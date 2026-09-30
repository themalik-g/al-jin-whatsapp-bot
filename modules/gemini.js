// ─────────────────────────────────────────────
// WRAITH · modules/gemini.js
// .gemini <prompt> — Gemini AI simple text response
// .scholar <topic/question> — Academic Scholar AI Assistant
// .photo <prompt> — AI image generator (gemini-3.1-flash-lite-image -> gemini-3.1-flash-image -> fallback)
// ─────────────────────────────────────────────
import { getKey } from '../core/keys.js';
import { fetchBuffer } from '../lib/net.js';
import { sendWithCta } from '../lib/buttons.js';
import { getVar } from '../core/vars.js';

function getQuotedText(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return '';
  const qm = ctx.quotedMessage;
  return (
    qm.conversation ||
    qm.extendedTextMessage?.text ||
    qm.interactiveMessage?.body?.text ||
    qm.imageMessage?.caption ||
    qm.videoMessage?.caption ||
    ''
  ).trim();
}

/**
 * .gemini <prompt> — Generates simple AI text response
 */
export async function geminiCommand(sock, chat, msg, args) {
  let userText = (args || []).join(' ').trim();
  const quoted = getQuotedText(msg);

  if (!userText && !quoted) {
    return sendWithCta(sock, chat, `🤖 *Gemini AI Assistant*\n\nUsage: \`.gemini <question or prompt>\`\nOr reply to a message with \`.gemini <question>\`\n\nExample: \`.gemini Explain quantum physics in simple terms\``, { quoted: msg });
  }

  let fullPrompt = userText;
  if (quoted) {
    fullPrompt = userText
      ? `Reference Message:\n"${quoted}"\n\nUser Request: ${userText}`
      : `Reference Message:\n"${quoted}"\n\nPlease summarize or analyze this text.`;
  }

  const apiKey = getVar('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || getKey('GEMINI_API_KEY');

  if (!apiKey) {
    return sendWithCta(sock, chat, `❌ *Gemini API Key Required*\n\nPlease set your Gemini API key using:\n\`.setvar GEMINI_API_KEY <your_key>\``, { quoted: msg });
  }

  const statusMsg = await sock.sendMessage(chat, {
    text: `🤖 *Thinking with Gemini AI…*`
  }, { quoted: msg });

  try {
    let aiResponse = '';

    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }]
          })
        });

        if (res.ok) {
          const json = await res.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            aiResponse = text.trim();
            break;
          }
        }
      } catch (e) {
        console.warn(`[geminiCommand] ${model} API error:`, e.message);
      }
    }

    if (!aiResponse) {
      throw new Error('Unable to generate AI response from Gemini API. Please check your GEMINI_API_KEY.');
    }

    const replyText = `🤖 *Gemini AI*\n\n${aiResponse}\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`;

    await sock.sendMessage(chat, {
      text: replyText,
      edit: statusMsg.key
    }).catch(() => {
      sock.sendMessage(chat, { text: replyText }, { quoted: msg }).catch(() => {});
    });

  } catch (err) {
    console.error('[geminiCommand]', err.message);
    const errText = `❌ *Gemini AI Failed:* ${err.message}`;
    await sock.sendMessage(chat, {
      text: errText,
      edit: statusMsg.key
    }).catch(() => {
      sock.sendMessage(chat, { text: errText }, { quoted: msg }).catch(() => {});
    });
  }
}

/**
 * .scholar <topic/question> — Academic Scholar & Professor AI
 */
export async function scholarCommand(sock, chat, msg, args) {
  let userText = (args || []).join(' ').trim();
  const quoted = getQuotedText(msg);

  if (!userText && !quoted) {
    return sendWithCta(sock, chat, `🎓 *AI Scholar & Professor*\n\nUsage: \`.scholar <topic or question>\`\n\nExample: \`.scholar How do neural networks learn through backpropagation?\``, { quoted: msg });
  }

  let fullPrompt = userText;
  if (quoted) {
    fullPrompt = userText
      ? `Context / Text:\n"${quoted}"\n\nQuestion / Topic: ${userText}`
      : `Context / Text:\n"${quoted}"\n\nPlease explain this topic systematically.`;
  }

  const apiKey = getVar('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || getKey('GEMINI_API_KEY');

  if (!apiKey) {
    return sendWithCta(sock, chat, `❌ *Gemini API Key Required*\n\nPlease set your Gemini API key using:\n\`.setvar GEMINI_API_KEY <your_key>\``, { quoted: msg });
  }

  const statusMsg = await sock.sendMessage(chat, {
    text: `🎓 *Scholar AI is analyzing topic…*`
  }, { quoted: msg });

  const systemInstruction = `You are an expert university professor and scholar explaining topics to university students.
Always structure your explanation logically:
1. Mental Model / Core Concept First: Provide an intuitive analogy or core principle so the student forms a solid mental framework.
2. Step-by-Step Breakdown: Explain the underlying mechanics and details clearly and concisely.
3. Real-World Application / Key Takeaways: Summarize practical importance and key points.
Keep tone engaging, authoritative yet accessible, and crystal clear.`;

  try {
    let aiResponse = '';
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: fullPrompt }] }]
          })
        });

        if (res.ok) {
          const json = await res.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            aiResponse = text.trim();
            break;
          }
        }
      } catch (e) {
        console.warn(`[scholarCommand] ${model} API error:`, e.message);
      }
    }

    if (!aiResponse) {
      throw new Error('Unable to generate AI Scholar response from Gemini API. Please check your GEMINI_API_KEY.');
    }

    const replyText = `🎓 *AI SCHOLAR & PROFESSOR*\n\n${aiResponse}\n\nProvided by 𝗪𝗥𝗔𝗜𝗧🇭`;

    await sock.sendMessage(chat, {
      text: replyText,
      edit: statusMsg.key
    }).catch(() => {
      sock.sendMessage(chat, { text: replyText }, { quoted: msg }).catch(() => {});
    });

  } catch (err) {
    console.error('[scholarCommand]', err.message);
    const errText = `❌ *Scholar AI Failed:* ${err.message}`;
    await sock.sendMessage(chat, {
      text: errText,
      edit: statusMsg.key
    }).catch(() => {
      sock.sendMessage(chat, { text: errText }, { quoted: msg }).catch(() => {});
    });
  }
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
