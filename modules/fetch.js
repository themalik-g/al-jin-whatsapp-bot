import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { isOwner } from '../core/identity.js';

/**
 * Creates a valid ZIP archive buffer in pure JS (Deflate compression via zlib)
 * @param {Array<{ relPath: string, fullPath: string }>} files
 * @returns {Buffer}
 */
function createZipBuffer(files) {
  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(file.fullPath);
    const filenameBuf = Buffer.from(file.relPath.replace(/\\/g, '/'), 'utf8');
    const compressed = zlib.deflateRawSync(data);

    // CRC32 calculation
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;

    // Local file header (30 bytes + filename + compressed data)
    const lfh = Buffer.alloc(30 + filenameBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0); // Local file header signature
    lfh.writeUInt16LE(20, 4);         // Version needed
    lfh.writeUInt16LE(0, 6);          // General flag
    lfh.writeUInt16LE(8, 8);          // Compression method (8 = Deflate)
    lfh.writeUInt16LE(0, 10);         // Last mod time
    lfh.writeUInt16LE(0, 12);         // Last mod date
    lfh.writeUInt32LE(crc, 14);       // CRC-32
    lfh.writeUInt32LE(compressed.length, 18); // Compressed size
    lfh.writeUInt32LE(data.length, 22);       // Uncompressed size
    lfh.writeUInt16LE(filenameBuf.length, 26); // Filename length
    lfh.writeUInt16LE(0, 28);         // Extra field length
    filenameBuf.copy(lfh, 30);

    // Central directory header (46 bytes + filename)
    const cdh = Buffer.alloc(46 + filenameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0); // Central directory signature
    cdh.writeUInt16LE(20, 4);         // Version made by
    cdh.writeUInt16LE(20, 6);         // Version needed
    cdh.writeUInt16LE(0, 8);          // General flag
    cdh.writeUInt16LE(8, 10);         // Compression method
    cdh.writeUInt16LE(0, 12);         // Last mod time
    cdh.writeUInt16LE(0, 14);         // Last mod date
    cdh.writeUInt32LE(crc, 16);       // CRC-32
    cdh.writeUInt32LE(compressed.length, 20); // Compressed size
    cdh.writeUInt32LE(data.length, 24);       // Uncompressed size
    cdh.writeUInt16LE(filenameBuf.length, 28); // Filename length
    cdh.writeUInt16LE(0, 30);         // Extra field length
    cdh.writeUInt16LE(0, 32);         // File comment length
    cdh.writeUInt16LE(0, 34);         // Disk number start
    cdh.writeUInt16LE(0, 36);         // Internal file attributes
    cdh.writeUInt32LE(0, 38);         // External file attributes
    cdh.writeUInt32LE(offset, 42);    // Relative offset of local header
    filenameBuf.copy(cdh, 46);

    localHeaders.push(lfh, compressed);
    centralDirs.push(cdh);
    offset += lfh.length + compressed.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cdh of centralDirs) {
    cdSize += cdh.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);   // EOCD signature
  eocd.writeUInt16LE(0, 4);            // Number of this disk
  eocd.writeUInt16LE(0, 6);            // Disk where CD starts
  eocd.writeUInt16LE(files.length, 8);  // Number of CD records on this disk
  eocd.writeUInt16LE(files.length, 10); // Total number of CD records
  eocd.writeUInt32LE(cdSize, 12);      // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16);    // Offset of start of CD
  eocd.writeUInt16LE(0, 20);           // Comment length

  return Buffer.concat([...localHeaders, ...centralDirs, eocd]);
}

/**
 * Recursively scans directory for files, skipping hidden files/directories starting with '.'
 */
function scanFilesRecursive(dirPath, baseFolder = '') {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip hidden files/dirs

      const fullPath = path.join(dirPath, entry.name);
      const relPath = baseFolder ? path.join(baseFolder, entry.name) : entry.name;

      if (entry.isDirectory()) {
        results.push(...scanFilesRecursive(fullPath, relPath));
      } else if (entry.isFile()) {
        results.push({ relPath, fullPath });
      }
    }
  } catch (err) {
    console.error(`[fetch] Error scanning directory ${dirPath}:`, err.message);
  }

  return results;
}

/**
 * Resolves session directory paths for vault and logs
 */
function resolveSessionPaths(sessionId) {
  const repoRoot = process.env.WRAITH_REPO_ROOT || process.cwd();
  const instDir = path.join(repoRoot, 'instances', sessionId);

  const targets = [];

  // Check instance vault and logs
  const vaultDir = path.join(instDir, 'vault');
  const logsDir = path.join(instDir, 'logs');

  if (fs.existsSync(vaultDir)) targets.push({ folderName: 'vault', dirPath: vaultDir });
  if (fs.existsSync(logsDir)) targets.push({ folderName: 'logs', dirPath: logsDir });

  // Fallback for 'main' if instances/main doesn't exist or is empty
  if (sessionId === 'main') {
    const rootVault = path.join(repoRoot, 'vault');
    const rootLogs = path.join(repoRoot, 'logs');

    if (!fs.existsSync(vaultDir) && fs.existsSync(rootVault)) {
      targets.push({ folderName: 'vault', dirPath: rootVault });
    }
    if (!fs.existsSync(logsDir) && fs.existsSync(rootLogs)) {
      targets.push({ folderName: 'logs', dirPath: rootLogs });
    }
  }

  // Check if current process WRAITH_DATA_DIR matches session or active environment
  if (process.env.WRAITH_SESSION_ID === sessionId && process.env.WRAITH_DATA_DIR) {
    const activeDataDir = process.env.WRAITH_DATA_DIR;
    const activeVault = path.join(activeDataDir, 'vault');
    const activeLogs = path.join(activeDataDir, 'logs');

    if (!targets.some(t => t.folderName === 'vault') && fs.existsSync(activeVault)) {
      targets.push({ folderName: 'vault', dirPath: activeVault });
    }
    if (!targets.some(t => t.folderName === 'logs') && fs.existsSync(activeLogs)) {
      targets.push({ folderName: 'logs', dirPath: activeLogs });
    }
  }

  return targets;
}

/**
 * Handler for .fetch <session_id>
 */
export async function fetchCommand(sock, chat, msg, args) {
  // 1. Incomplete command -> NO response
  if (!args || !args[0] || !args[0].trim()) {
    return;
  }

  // 2. Owner restriction check
  const sender = msg.key?.participant || msg.key?.remoteJid;
  if (!msg.key?.fromMe && !isOwner(sender)) {
    return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  }

  const sessionId = args[0].trim().toLowerCase();
  const sessionTargets = resolveSessionPaths(sessionId);

  const allFiles = [];
  for (const target of sessionTargets) {
    const files = scanFilesRecursive(target.dirPath, target.folderName);
    allFiles.push(...files);
  }

  // 3. No files found
  if (allFiles.length === 0) {
    return sock.sendMessage(
      chat,
      { text: `⚠️ No files found in vault or logs for session *${sessionId}*` },
      { quoted: msg }
    );
  }

  // 4. Package files into ZIP and send
  try {
    const zipBuffer = createZipBuffer(allFiles);
    const fileName = `${sessionId}_vault_logs.zip`;

    await sock.sendMessage(
      chat,
      {
        document: zipBuffer,
        fileName,
        mimetype: 'application/zip',
        caption: `📦 Vault & Logs archive for session *${sessionId}* (${allFiles.length} file${allFiles.length === 1 ? '' : 's'})`
      },
      { quoted: msg }
    );

    if (global.gc) {
      try { global.gc(); } catch {}
    }
  } catch (err) {
    console.error(`[fetch] Error creating/sending zip for session ${sessionId}:`, err);
    await sock.sendMessage(
      chat,
      { text: `⚠️ Failed to fetch session files: ${err.message}` },
      { quoted: msg }
    );
  }
}
