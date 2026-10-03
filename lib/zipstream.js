// lib/zipstream.js — tiny streaming ZIP writer (STORE, no compression).
// Zero dependencies, constant RAM: every file is piped from disk in 64 KB chunks
// and the CRC is computed on the fly (data-descriptor mode).
import fs from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crcUpdate(crc, buf) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export class ZipWriter {
  constructor(destPath) {
    this.ws = fs.createWriteStream(destPath);
    this.offset = 0;
    this.entries = [];
    this.failed = null;
    this.ws.on('error', (e) => { this.failed = e; });
  }

  _write(buf) {
    if (this.failed) return Promise.reject(this.failed);
    this.offset += buf.length;
    return new Promise((resolve, reject) => {
      const ok = this.ws.write(buf, (err) => err && reject(err));
      if (ok) resolve(); else this.ws.once('drain', resolve);
    });
  }

  async addFile(name, srcPath) {
    const nameBuf = Buffer.from(name, 'utf8');
    const { time, date } = dosDateTime();
    const headerOffset = this.offset;

    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0808, 6);       // bit3 = data descriptor, bit11 = UTF-8 names
    h.writeUInt16LE(0, 8);            // STORE
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt16LE(nameBuf.length, 26);
    await this._write(h);
    await this._write(nameBuf);

    let crc = 0; let size = 0;
    for await (const chunk of fs.createReadStream(srcPath, { highWaterMark: 64 * 1024 })) {
      crc = crcUpdate(crc, chunk);
      size += chunk.length;
      await this._write(chunk);
    }

    const d = Buffer.alloc(16);
    d.writeUInt32LE(0x08074b50, 0);
    d.writeUInt32LE(crc, 4);
    d.writeUInt32LE(size, 8);
    d.writeUInt32LE(size, 12);
    await this._write(d);

    this.entries.push({ nameBuf, crc, size, time, date, headerOffset });
  }

  async finalize() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0808, 8);
      c.writeUInt16LE(0, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.date, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.size, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.nameBuf.length, 28);
      c.writeUInt32LE(e.headerOffset, 42);
      await this._write(c);
      await this._write(e.nameBuf);
    }
    const cdSize = this.offset - cdStart;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(cdSize, 12);
    end.writeUInt32LE(cdStart, 16);
    await this._write(end);
    await new Promise((res, rej) => this.ws.end((err) => (err ? rej(err) : res())));
    return { files: this.entries.length, bytes: this.offset };
  }
}
