#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCity, toImportItems } from './lib/eczaneler-parse.mjs';
import { dutyDateOf } from '../src/shared/duty.ts';

const ilArg = process.argv[2] || '34';
const BASE = 'https://www.eczaneler.gen.tr';
const PATH = '/iframe.php';
const UA = 'nobetci-eczane/0.1 (+https://nobetcieczane.becayisler.com)';

async function fetchCity(code) {
  const url = `${BASE}${PATH}?lokasyon=${code}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'tr-TR,tr;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function run() {
  const now = new Date();
  const dutyDate = dutyDateOf(now);
  const cityCode = Number(ilArg);
  const city = { code: cityCode, name: cityCode === 34 ? 'İstanbul' : cityCode === 35 ? 'İzmir' : cityCode === 6 ? 'Ankara' : cityCode === 7 ? 'Antalya' : 'İl' };

  console.log(`İl ${city.name} (${cityCode}) için nöbetçiler çekiliyor (Tarih: ${dutyDate})...`);
  const html = await fetchCity(cityCode);
  const rows = parseCity(html, city.name);
  console.log(`${rows.length} eczane ayrıştırıldı.`);

  const { items } = toImportItems(rows, city, dutyDate);
  console.log(`${items.length} nöbetçi kaydı hazırlandı.`);

  // SQL oluştur
  const sqlLines = [];
  sqlLines.push('PRAGMA foreign_keys = OFF;');

  // İlçeleri ekle
  for (const item of items) {
    const dCode = `${cityCode}-${item.districtSlug}`.slice(0, 40);
    const safeDistName = item.districtName.replace(/'/g, "''");
    const safeDistSlug = item.districtSlug.replace(/'/g, "''");
    sqlLines.push(
      `INSERT INTO district (code, city_code, name, slug, sort_order) VALUES ('${dCode}', ${cityCode}, '${safeDistName}', '${safeDistSlug}', 999) ON CONFLICT (city_code, slug) DO NOTHING;`,
    );
  }

  // Eczaneleri ekle / güncelle
  for (const item of items) {
    const dCode = `${cityCode}-${item.districtSlug}`.slice(0, 40);
    const safeSlug = item.slug.replace(/'/g, "''");
    const safeName = item.name.replace(/'/g, "''");
    const safeAddress = item.address.replace(/'/g, "''");
    const phoneVal = item.phone ? `'${item.phone.replace(/'/g, "''")}'` : 'NULL';
    const latVal = item.lat !== null && item.lat !== undefined ? item.lat : 'NULL';
    const lngVal = item.lng !== null && item.lng !== undefined ? item.lng : 'NULL';

    sqlLines.push(
      `INSERT INTO pharmacy (slug, name, phone, address, district_code, lat, lng, coord_source) ` +
        `VALUES ('${safeSlug}', '${safeName}', ${phoneVal}, '${safeAddress}', '${dCode}', ${latVal}, ${lngVal}, 'edevlet') ` +
        `ON CONFLICT (slug) DO UPDATE SET ` +
        `name = excluded.name, phone = excluded.phone, address = excluded.address, ` +
        `lat = CASE WHEN pharmacy.coord_source = 'manual' THEN pharmacy.lat ELSE excluded.lat END, ` +
        `lng = CASE WHEN pharmacy.coord_source = 'manual' THEN pharmacy.lng ELSE excluded.lng END;`,
    );
  }

  // Bugünün eski otomatik nöbetlerini temizle
  sqlLines.push(
    `DELETE FROM duty_shift WHERE duty_date = '${dutyDate}' AND source = 'edevlet' AND pharmacy_id IN (SELECT id FROM pharmacy WHERE district_code LIKE '${cityCode}-%');`,
  );

  // Nöbetleri ekle
  for (const item of items) {
    const safeSlug = item.slug.replace(/'/g, "''");
    sqlLines.push(
      `INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, source, created_by) ` +
        `SELECT id, '${dutyDate}', '${item.dutyStart}', '${item.dutyEnd}', 'edevlet', 'script' ` +
        `FROM pharmacy WHERE slug = '${safeSlug}' ` +
        `ON CONFLICT (duty_date, pharmacy_id) DO UPDATE SET duty_start = excluded.duty_start, duty_end = excluded.duty_end;`,
    );
  }

  const tmpFile = join(tmpdir(), `d1-import-${cityCode}-${Date.now()}.sql`);
  writeFileSync(tmpFile, sqlLines.join('\n'), 'utf8');

  console.log(`D1'e aktarılıyor (${sqlLines.length} sorgu)...`);
  try {
    execSync(`npx wrangler d1 execute nobetci-eczane --remote --yes --file="${tmpFile}"`, {
      stdio: 'inherit',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
    });
    console.log(`✓ İl ${cityCode} başarıyla D1'e aktarıldı!`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

run().catch((e) => {
  console.error('Hata:', e);
  process.exit(1);
});
