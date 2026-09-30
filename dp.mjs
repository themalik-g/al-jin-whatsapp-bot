/**
 * dp.mjs - Standalone full-size / HD profile picture plugin for upstream Baileys.
 *
 * No forked Baileys needed. It talks to WhatsApp through sock.query(), the same
 * request Baileys itself uses, but skips the forced 640x640 crop.
 *
 * Modes
 *   full : keeps the original shape, nothing cropped, downscaled only above 4096px
 *   hd   : square 1080x1080 canvas, whole image visible (padded, never cropped)
 *
 * Image library (uses whichever is installed, sharp first, then jimp):
 *   npm i sharp        (fast)      or      npm i jimp       (pure JS, lighter)
 *
 * Exports
 *   setDp(sock, jid, imageBuffer, { mode, background })  -> { ok, method, note?, error? }
 *   dpFromMessage(sock, msg, { mode, target, background }) -> handles a chat command
 *
 * Example (inside your message handler, ESM):
 *   import { dpFromMessage } from './dp.mjs'
 *   // .hddp  -> await dpFromMessage(sock, msg, { mode: 'hd' })
 *   // .fulldp -> await dpFromMessage(sock, msg, { mode: 'full' })
 *   // group dp -> await dpFromMessage(sock, msg, { mode: 'hd', target: msg.key.remoteJid })
 *
 * CommonJS project? Load it with:  const { dpFromMessage } = await import('./dp.mjs')
 *
 * Every function catches its own errors and never throws, so the bot keeps running.
 * Images are handled in memory only, so there are no temp files to clean up.
 */

const S_WHATSAPP_NET = '@s.whatsapp.net'
const MAX_INPUT_BYTES = 10 * 1024 * 1024 // refuse source images above 10 MB

const MODES = {
  full: { label: 'Full size', maxSide: 4096, quality: 95 },
  hd: { label: 'HD', size: 1080, quality: 92 }
}

/* ------------------------------ image library ----------------------------- */

let processorPromise = null

function getProcessor() {
  if (!processorPromise) processorPromise = loadProcessor()
  return processorPromise
}

async function loadProcessor() {
  // Option 1: sharp
  try {
    const sharp = (await import('sharp')).default
    return {
      name: 'sharp',
      async square(buf, size, background, quality) {
        const bg = background === 'white' ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 1 }
        return sharp(buf).rotate().resize(size, size, { fit: 'contain', background: bg }).jpeg({ quality }).toBuffer()
      },
      async fit(buf, maxSide, quality) {
        return sharp(buf)
          .rotate()
          .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer()
      }
    }
  } catch {
    /* sharp not installed, try jimp */
  }

  // Option 2: jimp (v1 API)
  try {
    const { Jimp } = await import('jimp')
    return {
      name: 'jimp',
      async square(buf, size, background, quality) {
        const img = await Jimp.read(buf)
        img.scaleToFit({ w: size, h: size })
        const canvas = new Jimp({ width: size, height: size, color: background === 'white' ? 0xffffffff : 0x000000ff })
        canvas.composite(img, Math.round((size - img.width) / 2), Math.round((size - img.height) / 2))
        return canvas.getBuffer('image/jpeg', { quality })
      },
      async fit(buf, maxSide, quality) {
        const img = await Jimp.read(buf)
        if (Math.max(img.width, img.height) > maxSide) img.scaleToFit({ w: maxSide, h: maxSide })
        return img.getBuffer('image/jpeg', { quality })
      }
    }
  } catch {
    /* jimp not installed either */
  }

  return null
}

/* --------------------------------- helpers -------------------------------- */

const fail = (error) => ({ ok: false, error })

function normalizeJid(jid = '') {
  return String(jid).replace(/:\d+@/, '@') // drop the device suffix
}

function isSelf(sock, jid) {
  const mine = [sock?.user?.id, sock?.user?.lid].filter(Boolean).map(normalizeJid)
  return mine.includes(normalizeJid(jid))
}

function toNumber(value) {
  if (value == null) return 0
  return Number(value.toString()) || 0 // handles protobuf Long values
}

/** Sends the picture to WhatsApp without Baileys' forced 640x640 crop. */
async function uploadPicture(sock, jid, buffer) {
  const attrs = { to: S_WHATSAPP_NET, type: 'set', xmlns: 'w:profile:picture' }
  if (jid && !isSelf(sock, jid)) attrs.target = normalizeJid(jid) // other person's or a group's picture
  await sock.query({
    tag: 'iq',
    attrs,
    content: [{ tag: 'picture', attrs: { type: 'image' }, content: buffer }]
  })
}

/* ---------------------------------- core ---------------------------------- */

/**
 * Sets a profile picture.
 * @param sock   Baileys socket
 * @param jid    own JID (bot picture) or a group JID
 * @param image  Buffer with the source image
 * @param opts   { mode: 'hd' | 'full', background: 'black' | 'white' }
 */
export async function setDp(sock, jid, image, { mode = 'hd', background = 'black' } = {}) {
  try {
    if (!Buffer.isBuffer(image) || image.length === 0) return fail('No image data received.')
    if (image.length > MAX_INPUT_BYTES) return fail('Image is too large (limit 10 MB).')

    const cfg = MODES[mode]
    if (!cfg) return fail(`Unknown mode "${mode}". Use "hd" or "full".`)

    const proc = await getProcessor()
    if (!proc) return fail('No image library found. Run: npm i sharp   (or: npm i jimp)')

    // Attempt 1: full / HD upload
    let firstError = null
    try {
      const buffer = cfg.size
        ? await proc.square(image, cfg.size, background, cfg.quality)
        : await proc.fit(image, cfg.maxSide, cfg.quality)
      await uploadPicture(sock, jid, buffer)
      return { ok: true, method: mode }
    } catch (err) {
      firstError = err
    }

    // Attempt 2 (fallback): standard Baileys call with an uncropped 640px square
    try {
      const buffer = await proc.square(image, 640, background, 90)
      await sock.updateProfilePicture(jid, buffer)
      return {
        ok: true,
        method: 'standard-640',
        note: `${cfg.label} upload was rejected, so the standard 640px picture was used.`
      }
    } catch (err) {
      return fail(`Could not update the picture: ${err?.message || firstError?.message || 'unknown error'}`)
    }
  } catch (err) {
    return fail(`Unexpected error: ${err?.message || err}`)
  }
}

/* ------------------------- chat command integration ------------------------ */

function unwrap(content) {
  let current = content
  for (let i = 0; i < 5; i++) {
    const inner =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.documentWithCaptionMessage?.message
    if (!inner) break
    current = inner
  }
  return current
}

/** Finds an image in the command message itself, or in the message it replies to. */
function findImage(msg) {
  const own = unwrap(msg?.message)
  if (own?.imageMessage) return { message: msg, image: own.imageMessage }

  const ctx = own?.extendedTextMessage?.contextInfo
  const quoted = unwrap(ctx?.quotedMessage)
  if (quoted?.imageMessage) {
    return {
      message: {
        key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant },
        message: ctx.quotedMessage
      },
      image: quoted.imageMessage
    }
  }
  return null
}

/**
 * Handles a command like ".hddp" or ".fulldp":
 * the image is either attached to the command or the command replies to an image.
 * Result (or error) is always sent back to the chat.
 */
export async function dpFromMessage(sock, msg, { mode = 'hd', target, background = 'black' } = {}) {
  const chat = msg?.key?.remoteJid
  const reply = async (text) => {
    try {
      await sock.sendMessage(chat, { text }, { quoted: msg })
    } catch {
      /* ignore send errors */
    }
  }

  try {
    const found = findImage(msg)
    if (!found) {
      await reply('Send an image with the command, or reply to an image with it.')
      return fail('no image')
    }

    if (toNumber(found.image.fileLength) > MAX_INPUT_BYTES) {
      await reply('That image is too large (limit 10 MB).')
      return fail('too large')
    }

    const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
    const buffer = await downloadMediaMessage(found.message, 'buffer', {})

    const result = await setDp(sock, target || sock.user?.id, buffer, { mode, background })

    if (result.ok) {
      const label = MODES[mode]?.label || mode
      await reply(result.note ? `⚠️ ${result.note}` : `✅ Profile picture updated (${label}).`)
    } else {
      await reply(`❌ ${result.error}`)
    }
    return result
  } catch (err) {
    await reply(`❌ Could not update the picture: ${err?.message || err}`)
    return fail(err?.message || 'unexpected error')
  }
}
