// ─────────────────────────────────────────────
//  WRAITH · modules/pps.js
//  Profile Picture Sync (PPS) for DM chats.
//  Downloads and updates profile pictures of the top 10 DM chats daily.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, inState } from '../core/paths.js';
import { readJson } from '../core/state-io.js';

let ppsInterval = null;

export function ppsDir() {
    const dir = path.join(dataDir(), 'pps');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export async function syncProfilePictures(sock) {
    try {
        if (!sock) return;
        const dir = ppsDir();

        // 1. Clear existing files in pps directory
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                fs.rmSync(path.join(dir, f), { force: true });
            }
        } catch (e) {
            console.error('[pps] failed to clear directory:', e.message);
        }

        // 2. Read activity.json to get top DM chats
        const activityFile = inState('activity.json');
        const activity = readJson(activityFile, {});

        // Filter for individual DM chats (@s.whatsapp.net)
        const dmChats = Object.entries(activity)
            .filter(([jid]) => jid.endsWith('@s.whatsapp.net') && !jid.includes('broadcast'))
            .sort((a, b) => (b[1]?.lastActive || 0) - (a[1]?.lastActive || 0))
            .slice(0, 10);

        if (dmChats.length === 0) {
            console.log('[pps] No DM chats found in activity history.');
            return;
        }

        // 3. Download and save profile pictures
        for (const [jid] of dmChats) {
            try {
                let ppUrl = null;
                try {
                    ppUrl = await sock.profilePictureUrl(jid, 'image');
                } catch {
                    try {
                        ppUrl = await sock.profilePictureUrl(jid);
                    } catch {}
                }

                if (!ppUrl) continue;

                const res = await fetch(ppUrl);
                if (!res.ok) continue;

                const arrayBuffer = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const fileName = `${jid}profile.jpg`;
                const filePath = path.join(dir, fileName);
                fs.writeFileSync(filePath, buffer);
            } catch (e) {
                console.error(`[pps] Failed downloading profile picture for ${jid}:`, e.message);
            }
        }
    } catch (e) {
        console.error('[pps] syncProfilePictures error:', e.message);
    }
}

export function startPpsSync(sock) {
    if (ppsInterval) clearInterval(ppsInterval);
    // Initial sync on startup (delayed slightly to allow connection setup)
    setTimeout(() => {
        syncProfilePictures(sock);
    }, 10000);

    // Repeat once every 24 hours (86,400,000 ms)
    ppsInterval = setInterval(() => {
        syncProfilePictures(sock);
    }, 24 * 60 * 60 * 1000);

    if (typeof ppsInterval.unref === 'function') {
        ppsInterval.unref();
    }
}

export function stopPpsSync() {
    if (ppsInterval) {
        clearInterval(ppsInterval);
        ppsInterval = null;
    }
}
