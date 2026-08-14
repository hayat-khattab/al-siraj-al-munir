import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/icons');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const GOLD = [216, 180, 90];
const BG = [12, 22, 32];

function makeIcon(S) {
  const rgba = Buffer.alloc(S * S * 4);
  const c = (S - 1) / 2;
  const R = S / 2;
  const lw = 0.016;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - c) / R;
      const dy = (y - c) / R;
      const dist = Math.hypot(dx, dy);
      const idx = (y * S + x) * 4;
      const qx = Math.max(Math.abs(dx) - 0.86, 0);
      const qy = Math.max(Math.abs(dy) - 0.86, 0);
      const inRounded = Math.hypot(qx, qy) < 0.14;
      if (!inRounded) continue;
      rgba[idx] = BG[0];
      rgba[idx + 1] = BG[1];
      rgba[idx + 2] = BG[2];
      rgba[idx + 3] = 255;
      const ring = Math.abs(dist - 0.42) < lw || Math.abs(dist - 0.66) < lw;
      const spoke = Math.abs(dx) < lw || Math.abs(dy) < lw || Math.abs(dx - dy) / Math.SQRT2 < lw || Math.abs(dx + dy) / Math.SQRT2 < lw;
      if (ring || spoke) {
        rgba[idx] = GOLD[0];
        rgba[idx + 1] = GOLD[1];
        rgba[idx + 2] = GOLD[2];
      }
    }
  }
  return rgba;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  const png = encodePNG(size, size, makeIcon(size));
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
