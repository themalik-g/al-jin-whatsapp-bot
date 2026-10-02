// ─────────────────────────────────────────────
// 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃 · modules/network-tools.js
// Online Lookup & Network Utilities:
// speedtest, npm, unroll, web2img/webss, tempmail/readmail, whatanime
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { getMediaFromMsg } from './media-tools.js';
import { chunkText } from '../lib/net.js';

const TMP_DIR = () => {
  const dir = path.resolve(process.env.MEHTAB_MD_DATA_DIR || process.cwd(), 'data', 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// ── .speedtest ──────────────────────────────────────────────────────────────
export async function speedtestCommand(sock, chat, msg) {
  try {
    const startPing = Date.now();
    const pingRes = await fetch('https://www.google.com/generate_204', { cache: 'no-store' });
    const latency = Date.now() - startPing;

    // Test download speed (~5MB file)
    const dlStart = Date.now();
    const dlRes = await fetch('https://cachefly.cachefly.net/5mb.test', { cache: 'no-store' });
    const dlBuffer = await dlRes.arrayBuffer();
    const dlDuration = (Date.now() - dlStart) / 1000;
    const dlSizeMb = (dlBuffer.byteLength * 8) / (1024 * 1024);
    const dlSpeed = (dlSizeMb / dlDuration).toFixed(2);

    // Test upload speed (1MB buffer)
    const ulData = new Uint8Array(1024 * 1024);
    const ulStart = Date.now();
    await fetch('https://httpbin.org/post', {
      method: 'POST',
      body: ulData,
    });
    const ulDuration = (Date.now() - ulStart) / 1000;
    const ulSizeMb = (ulData.byteLength * 8) / (1024 * 1024);
    const ulSpeed = (ulSizeMb / ulDuration).toFixed(2);

    const report = [
      '🚀 *Network Speed Test*',
      '',
      `📡 *Latency:* ${latency} ms`,
      `📥 *Download:* ${dlSpeed} Mbps`,
      `📤 *Upload:* ${ulSpeed} Mbps`,
      '',
      'Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃'
    ].join('\n');

    await sock.sendMessage(chat, { text: report }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ speedtest failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .npm [package_name] ─────────────────────────────────────────────────────
export async function npmCommand(sock, chat, msg, args) {
  try {
    const pkgName = (args || []).join(' ').trim().toLowerCase();
    if (!pkgName) {
      return sock.sendMessage(chat, { text: '📦 *npm*\n\nUsage: `.npm <package_name>`' }, { quoted: msg });
    }

    const regRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`);
    if (!regRes.ok) {
      return sock.sendMessage(chat, { text: `❌ Package *${pkgName}* not found on NPM registry.` }, { quoted: msg });
    }

    const pkgData = await regRes.json();
    const latestVer = pkgData['dist-tags']?.latest;
    const latestInfo = pkgData.versions?.[latestVer] || {};

    let downloads = 'N/A';
    try {
      const dlRes = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkgName)}`);
      if (dlRes.ok) {
        const dlJson = await dlRes.json();
        if (dlJson.downloads !== undefined) downloads = dlJson.downloads.toLocaleString();
      }
    } catch {}

    const author = pkgData.author?.name || latestInfo.author?.name || 'N/A';
    const license = latestInfo.license || pkgData.license || 'N/A';
    const desc = pkgData.description || 'No description provided.';
    const homepage = pkgData.homepage || `https://www.npmjs.com/package/${pkgName}`;

    const report = [
      `📦 *${pkgData.name || pkgName}* (v${latestVer || '1.0.0'})`,
      `_${desc}_`,
      '',
      `👤 *Author:* ${author}`,
      `📄 *License:* ${license}`,
      `📊 *Weekly Downloads:* ${downloads}`,
      `🔗 *Homepage:* ${homepage}`,
      '',
      'Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃'
    ].join('\n');

    await sock.sendMessage(chat, { text: report }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ npm check failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .unroll [short_url] ─────────────────────────────────────────────────────
export async function unrollCommand(sock, chat, msg, args) {
  try {
    let targetUrl = (args || []).join(' ').trim();

    if (!targetUrl) {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
      const match = quotedText.match(/https?:\/\/[^\s]+/i);
      if (match) {
        targetUrl = match[0];
      }
    }

    if (!targetUrl || !targetUrl.startsWith('http')) {
      return sock.sendMessage(chat, { text: '🔓 *unroll*\n\nUsage: `.unroll <short_url>` or reply to a message containing a short URL.' }, { quoted: msg });
    }

    let currentUrl = targetUrl;
    const redirectChain = [currentUrl];

    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
        });
        const location = res.headers.get('location');
        if (location) {
          const nextUrl = new URL(location, currentUrl).href;
          redirectChain.push(nextUrl);
          currentUrl = nextUrl;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    const finalUrl = redirectChain[redirectChain.length - 1];
    const lines = [
      '🔓 *URL Unrolled*',
      '',
      `*Original:* ${targetUrl}`,
      `*Final Destination:* ${finalUrl}`,
    ];

    if (redirectChain.length > 2) {
      lines.push('');
      lines.push('*Redirect Chain:*');
      redirectChain.forEach((url, idx) => lines.push(`${idx + 1}. ${url}`));
    }

    lines.push('');
    lines.push('Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃');

    await sock.sendMessage(chat, { text: lines.join('\n') }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ unroll failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .web2img / .webss [url] ─────────────────────────────────────────────────
export async function web2imgCommand(sock, chat, msg, args) {
  try {
    let url = (args || []).join(' ').trim();
    if (!url) {
      return sock.sendMessage(chat, { text: '🌐 *web2img*\n\nUsage: `.web2img <url>` or `.webss <url>`' }, { quoted: msg });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    await sock.sendMessage(chat, { text: '📸 Capturing webpage screenshot...' }, { quoted: msg });

    const ssUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`;
    const res = await fetch(ssUrl);
    if (!res.ok) {
      throw new Error(`Microlink API status ${res.status}`);
    }

    const imgBuffer = Buffer.from(await res.arrayBuffer());

    await sock.sendMessage(chat, {
      image: imgBuffer,
      caption: `📸 *Web Screenshot*\n\nURL: ${url}\n\nProvided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃`,
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ web2img failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .tempmail & .readmail ───────────────────────────────────────────────────
let activeTempMailSession = null;

export async function tempmailCommand(sock, chat, msg, args) {
  try {
    const res = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address');
    if (!res.ok) throw new Error(`Guerrilla Mail API status ${res.status}`);
    const data = await res.json();

    if (!data?.email_addr || !data?.sid_token) {
      throw new Error('Invalid response from Guerrilla Mail server');
    }

    activeTempMailSession = {
      email: data.email_addr,
      sid_token: data.sid_token,
      created: Date.now()
    };

    await sock.sendMessage(chat, {
      text: `📧 *Temporary Email Generated (Guerrilla Mail)*\n\n\`${data.email_addr}\`\n\nTo check inbox:\n\`.readmail\` (or \`.readmail ${data.sid_token}\`)\n\nProvided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃`,
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ tempmail failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

export async function readmailCommand(sock, chat, msg, args) {
  try {
    let sidToken = (args || []).join(' ').trim();
    if (!sidToken && activeTempMailSession?.sid_token) {
      sidToken = activeTempMailSession.sid_token;
    }

    if (!sidToken) {
      return sock.sendMessage(chat, { text: '📧 *readmail*\n\nUsage: `.readmail` (checks active address) or `.readmail <session_id>`' }, { quoted: msg });
    }

    const listRes = await fetch(`https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token=${encodeURIComponent(sidToken)}`);
    if (!listRes.ok) throw new Error('Failed to connect to Guerrilla Mail server');
    const data = await listRes.json();

    const emailAddr = data.email_addr || activeTempMailSession?.email || 'Active Address';

    if (!data.list || data.list.length === 0) {
      return sock.sendMessage(chat, { text: `📬 Inbox is empty for *${emailAddr}*.` }, { quoted: msg });
    }

    const lines = [`📬 *Inbox for ${emailAddr}* (${data.list.length} message(s))`, ''];

    data.list.slice(0, 5).forEach((mail, i) => {
      lines.push(`📩 *${i + 1}. From:* ${mail.mail_from}`);
      lines.push(`📌 *Subject:* ${mail.mail_subject || '(no subject)'}`);
      lines.push(`💬 *Excerpt:* ${(mail.mail_excerpt || '').trim()}`);
      lines.push('----------------------------------------');
    });

    lines.push('');
    lines.push('Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃');

    for (const chunk of chunkText(lines.join('\n'), 3800)) {
      await sock.sendMessage(chat, { text: chunk }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ readmail failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .whatanime ──────────────────────────────────────────────────────────────
export async function whatanimeCommand(sock, chat, msg) {
  try {
    const media = await getMediaFromMsg(msg);
    if (!media || media.kind !== 'image') {
      return sock.sendMessage(chat, { text: '❌ Please reply to an anime screenshot/image with `.whatanime`.' }, { quoted: msg });
    }

    await sock.sendMessage(chat, { text: '🔍 Identifying anime scene...' }, { quoted: msg });

    const res = await fetch('https://api.trace.moe/search', {
      method: 'POST',
      body: media.buffer,
      headers: { 'Content-Type': media.mimetype || 'image/jpeg' },
    });

    if (!res.ok) throw new Error(`Trace.moe status ${res.status}`);
    const data = await res.json();

    const match = data.result?.[0];
    if (!match) {
      return sock.sendMessage(chat, { text: '❌ No matching anime scene found.' }, { quoted: msg });
    }

    const title = match.filename || match.anilist?.title?.native || match.anilist?.title?.romaji || match.anilist?.title?.english || 'Unknown Anime';
    const episode = match.episode || 'N/A';
    const similarity = (match.similarity * 100).toFixed(1);
    const fromSec = Math.floor(match.from);
    const toSec = Math.floor(match.to);
    const timestamp = `${Math.floor(fromSec / 60)}:${String(fromSec % 60).padStart(2, '0')} - ${Math.floor(toSec / 60)}:${String(toSec % 60).padStart(2, '0')}`;

    const caption = [
      '🎬 *Anime Scene Identified*',
      '',
      `📺 *Title:* ${title}`,
      `🎞️ *Episode:* ${episode}`,
      `⏱️ *Timestamp:* ${timestamp}`,
      `🎯 *Similarity:* ${similarity}%`,
      '',
      'Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃'
    ].join('\n');

    if (match.video) {
      try {
        await sock.sendMessage(chat, {
          video: { url: match.video },
          caption,
        }, { quoted: msg });
        return;
      } catch {}
    }

    await sock.sendMessage(chat, { text: caption }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ whatanime failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .githubdiff [github_pr_or_commit_url] ────────────────────────────────────
export async function githubdiffCommand(sock, chat, msg, args) {
  try {
    let url = (args || []).join(' ').trim();
    if (!url) {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
      const match = quotedText.match(/https?:\/\/github\.com\/[^\s]+/i);
      if (match) url = match[0];
    }

    if (!url || !url.toLowerCase().includes('github.com')) {
      return sock.sendMessage(chat, { text: '🐙 *githubdiff*\n\nUsage: `.githubdiff <github_pr_or_commit_url>`' }, { quoted: msg });
    }

    let cleanUrl = url.replace(/\.(diff|patch)$/i, '');
    const diffUrl = `${cleanUrl}.diff`;

    const res = await fetch(diffUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!res.ok) {
      return sock.sendMessage(chat, { text: `❌ Failed to fetch diff from GitHub (HTTP ${res.status}). Ensure the URL points to a valid public PR or commit.` }, { quoted: msg });
    }

    const diffText = await res.text();
    if (!diffText.trim()) {
      return sock.sendMessage(chat, { text: '❌ Empty diff received from GitHub.' }, { quoted: msg });
    }

    const lines = diffText.split('\n');
    let filesChanged = 0;
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git ')) filesChanged++;
      else if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }

    const header = [
      '🐙 *GitHub Diff Summary*',
      '',
      `🔗 *URL:* ${cleanUrl}`,
      `📁 *Files Changed:* ${filesChanged}`,
      `➕ *Additions:* +${additions}`,
      `➖ *Deletions:* -${deletions}`,
      ''
    ].join('\n');

    if (diffText.length <= 3000) {
      const fullText = `${header}\`\`\`diff\n${diffText.slice(0, 2800)}\n\`\`\`\n\nProvided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃`;
      return await sock.sendMessage(chat, { text: fullText }, { quoted: msg });
    } else {
      const snippet = diffText.slice(0, 1500);
      const docBuf = Buffer.from(diffText, 'utf-8');
      const fileName = `diff_${Date.now()}.diff`;
      await sock.sendMessage(chat, {
        document: docBuf,
        mimetype: 'text/x-diff',
        fileName,
        caption: `${header}\`\`\`diff\n${snippet}\n...\n[Truncated - full diff attached above]\n\`\`\`\n\nProvided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃`
      }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ githubdiff failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .urban / .slang / .gali [slang] ─────────────────────────────────────────
export async function urbanCommand(sock, chat, msg, args) {
  try {
    const term = (args || []).join(' ').trim();
    if (!term) {
      return sock.sendMessage(chat, { text: '🗣️ *urban / slang*\n\nUsage: `.urban <slang_term>` or `.slang <term>` or `.gali <term>`' }, { quoted: msg });
    }

    const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
    if (!res.ok) throw new Error(`Urban Dictionary API returned ${res.status}`);

    const data = await res.json();
    if (!data.list || data.list.length === 0) {
      return sock.sendMessage(chat, { text: `❌ No definition found on Urban Dictionary for *${term}*.` }, { quoted: msg });
    }

    const item = data.list[0];
    const cleanDef = (item.definition || '').replace(/\[|\]/g, '').trim();
    const cleanExample = (item.example || '').replace(/\[|\]/g, '').trim();

    const report = [
      `🗣️ *Urban Dictionary: ${item.word}*`,
      '',
      `📖 *Definition:*`,
      cleanDef,
      '',
      cleanExample ? `💬 *Example:*\n_${cleanExample}_\n` : '',
      `👍 *Upvotes:* ${item.thumbs_up || 0}  |  👎 *Downvotes:* ${item.thumbs_down || 0}`,
      '',
      'Provided by 𝐌𝐄𝐇𝐓𝐀𝐁-𝐌𝐃'
    ].filter(Boolean).join('\n');

    await sock.sendMessage(chat, { text: report }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ urban lookup failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
