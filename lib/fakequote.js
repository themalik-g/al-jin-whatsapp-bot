// ─────────────────────────────────────────────
//  Al-Jin · lib/fakequote.js
//  A fake "quoted message" that looks like a status posted by the verified
//  (blue-tick) WhatsApp account. Used as `{ quoted: businessStatusQuote() }`.
//
//  WhatsApp renders the sender of a quoted status from the quoted participant.
//  0@s.whatsapp.net is WhatsApp's own verified account; override with
//  WRAITH_FAKE_QUOTE_JID to try another verified business JID.
// ─────────────────────────────────────────────
export function businessStatusQuote(label = '𝐀𝐥-𝐉𝐢𝐧 • Official Business Account') {
  const participant = process.env.WRAITH_FAKE_QUOTE_JID || '0@s.whatsapp.net';
  return {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: 'ALJIN' + Date.now().toString(36).toUpperCase(),
      participant,
    },
    message: { extendedTextMessage: { text: label } },
    pushName: 'WhatsApp Business',
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}
