#!/usr/bin/env node
/**
 * Archivo ve Inter woff2 alt kümelerini indirir ve `public/fonts/` altına yazar.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Neden self-host: tasarım HTML'i Google Fonts CDN'i kullanıyor ama PWA
 * çevrimdışı çalışmalı ve CDN'e giden istek kullanıcıyı üçüncü tarafa açıyor.
 * Görsel çıktı aynı (bkz. design/DESIGN-TOKENS.md § Tipografi).
 *
 * Bir kere çalıştırılır; çıktı depoya commit edilir. Build sırasında ağa çıkılmaz.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap';

// Türkçe için latin-ext şart (ğ ş ı İ ö ü ç).
const WANTED_SUBSETS = new Set(['latin', 'latin-ext']);

const OUT_DIR = path.join(import.meta.dirname, '..', 'public', 'fonts');

const css = await fetch(CSS_URL, { headers: { 'User-Agent': UA } }).then((r) => {
  if (!r.ok) throw new Error(`Google Fonts CSS alınamadı: ${r.status}`);
  return r.text();
});

await mkdir(OUT_DIR, { recursive: true });

const blocks = css.split('@font-face').slice(1);
const faces = [];

for (const block of blocks) {
  const subset = block.match(/\/\*\s*(\S+)\s*\*\//)?.[1];
  const family = block.match(/font-family:\s*['"]([^'"]+)['"]/)?.[1];
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
  const url = block.match(/url\(([^)]+)\)/)?.[1];

  if (!subset || !family || !weight || !url) continue;
  if (!WANTED_SUBSETS.has(subset)) continue;

  faces.push({ family: family.replace(/\s+/g, ''), weight, subset, url });
}

if (faces.length === 0) throw new Error('Hiç font yüzü ayrıştırılamadı.');

let total = 0;
for (const f of faces) {
  const name = `${f.family}-${f.weight}-${f.subset}.woff2`;
  const buf = await fetch(f.url, { headers: { 'User-Agent': UA } }).then((r) => {
    if (!r.ok) throw new Error(`${name} alınamadı: ${r.status}`);
    return r.arrayBuffer();
  });
  await writeFile(path.join(OUT_DIR, name), Buffer.from(buf));
  total += buf.byteLength;
  console.log(`  ${name.padEnd(34)} ${(buf.byteLength / 1024).toFixed(1)} KB`);
}

console.log(`\n${faces.length} dosya · toplam ${(total / 1024).toFixed(0)} KB → public/fonts/`);
