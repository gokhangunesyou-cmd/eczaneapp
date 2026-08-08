#!/usr/bin/env node
/**
 * PWA ikonlarını üretir — bağımlılık yok, saf PNG yazıcı.
 *
 *   node scripts/make-icons.mjs
 *
 * Tasarımın uygulama ikonu: yeşil (#14C08A) yuvarlak kare üstünde koyu
 * (#04120D) eczane haçı. Değerler design/DESIGN-TOKENS.md'den.
 *
 * Bir kere çalıştırılır, çıktı depoya commit edilir.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const BRAND = [0x14, 0xc0, 0x8a];
const ON = [0x04, 0x12, 0x0d];

const OUT = path.join(import.meta.dirname, '..', 'public', 'icons');

/** RGBA piksel tamponundan PNG üretir. */
function png(width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 10,11,12 = 0 (deflate, adaptive filter, no interlace)

  // Her satırın başına filtre baytı (0 = None).
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param size    kenar uzunluğu
 * @param maskable true ise ikon güvenli bölgeye küçültülür ve zemin tam dolar
 */
function drawIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);

  // Yuvarlak kare yarıçapı — tasarımda 96px ikonda 30px (≈ %31).
  const radius = maskable ? 0 : size * 0.31;
  // Maskable ikonlarda içerik %80'lik güvenli daireye sığmalı.
  const scale = maskable ? 0.55 : 0.72;

  const armLong = size * scale * 0.62;
  const armShort = size * scale * 0.19;
  const cx = size / 2;
  const cy = size / 2;

  const inRoundedRect = (x, y) => {
    if (radius === 0) return true;
    const dx = Math.max(radius - x, 0, x - (size - radius));
    const dy = Math.max(radius - y, 0, y - (size - radius));
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedRect(x + 0.5, y + 0.5)) {
        buf[i + 3] = 0; // şeffaf
        continue;
      }

      const dx = Math.abs(x + 0.5 - cx);
      const dy = Math.abs(y + 0.5 - cy);
      const onCross =
        (dx <= armLong / 2 && dy <= armShort / 2) || (dx <= armShort / 2 && dy <= armLong / 2);

      const c = onCross ? ON : BRAND;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = 255;
    }
  }

  return png(size, size, buf);
}

await mkdir(OUT, { recursive: true });

const files = [
  ['icon-192.png', drawIcon(192, false)],
  ['icon-512.png', drawIcon(512, false)],
  ['icon-maskable-512.png', drawIcon(512, true)],
];

for (const [name, data] of files) {
  await writeFile(path.join(OUT, name), data);
  console.log(`  ${name.padEnd(24)} ${(data.length / 1024).toFixed(1)} KB`);
}

console.log(`\n${files.length} ikon → public/icons/`);
