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

    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
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

    const replyText = `🤖 *Gemini AI*\n\n${aiResponse}\n\nProvided by 𝗪𝗥ÃIТ🇭`;

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
    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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

    const replyText = `🎓 *AI SCHOLAR & PROFESSOR*\n\n${aiResponse}\n\nProvided by 𝗪𝗥ÃIТ🇭`;

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

    // 1. Prioritize Gemini Image Generation API models
    if (apiKey) {
      const imageModels = [
        'gemini-3.1-flash-lite-image',
        'gemini-3.1-flash-image',
        'imagen-3.0-generate-002',
        'imagen-3.0-fast-generate-001'
      ];
      for (const model of imageModels) {
        try {
          const isImagen = model.startsWith('imagen-');
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${isImagen ? 'predict' : 'generateContent'}?key=${apiKey}`;
          const bodyPayload = isImagen
            ? { instances: [{ prompt }], parameters: { sampleCount: 1 } }
            : { contents: [{ parts: [{ text: prompt }] }] };

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          });

          if (res.ok) {
            const json = await res.json();
            // Check generateContent format
            const parts = json?.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                break;
              }
            }
            // Check predict Imagen format
            if (!imageBuffer && json?.predictions?.[0]?.bytesBase64Encoded) {
              imageBuffer = Buffer.from(json.predictions[0].bytesBase64Encoded, 'base64');
            }
            if (imageBuffer) break;
          }
        } catch (e1) {
          console.warn(`[photoCommand] ${model} API failed:`, e1.message);
        }
      }
    }

    // 2. Fallback APIs if Gemini key not set or Gemini image model failed
    if (!imageBuffer) {
      const fallbackApis = [
        `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux`,
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`,
        `https://api.lolhuman.xyz/api/imagen?apikey=GataDios&text=${encodeURIComponent(prompt)}`
      ];

      for (const apiUrl of fallbackApis) {
        try {
          const buf = await fetchBuffer(apiUrl, { timeout: 25000 });
          if (buf && buf.length > 2048) {
            imageBuffer = buf;
            break;
          }
        } catch {}
      }
    }

    if (!imageBuffer || imageBuffer.length < 1024) {
      throw new Error('Could not generate AI photo for this prompt.');
    }

    await sock.sendMessage(chat, {
      image: imageBuffer,
      caption: `📸 *AI Photo Generator*\n💬 _${prompt}_\n\nProvided by 𝗪𝗥ÃIТ🇭`
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
