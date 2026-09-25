#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCity, toImportItems } from './lib/eczaneler-parse.mjs';
import { dutyDateOf } from '../src/shared/duty.ts';

import { CITIES_81 } from '../src/shared/cities.ts';

const ilArg = process.argv[2] || '1';
const BASE = 'https://www.eczaneler.gen.tr';
const PATH = '/iframe.php';
const UA = 'nobetci-eczane/0.1 (+https://nobetci-eczane.becayisler.com)';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function executeSql(sqlLines, label) {
  if (sqlLines.length <= 1) return;
  const tmpFile = join(tmpdir(), `d1-import-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(tmpFile, sqlLines.join('\n'), 'utf8');

  console.log(`D1'e aktarılıyor (${label} - ${sqlLines.length} sorgu)...`);
  try {
    execSync(`npx wrangler d1 execute nobetci-eczane --remote --yes --file="${tmpFile}"`, {
      stdio: 'inherit',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
    });
    console.log(`✓ ${label} başarıyla D1'e aktarıldı!`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

function generateCitySql(items, cityCode, dutyDate) {
  const sqlLines = [];

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

  return sqlLines;
}

async function run() {
  const now = new Date();
  const dutyDate = dutyDateOf(now);

  const isAll = ['tum', 'all', 'tumu', 'turkiye'].includes(ilArg.toLowerCase());
  const targetCities = isAll ? CITIES_81 : CITIES_81.filter((c) => c.code === Number(ilArg));

  if (targetCities.length === 0) {
    console.error(`İl bulunamadı: ${ilArg}`);
    process.exit(1);
  }

  console.log(`Toplam ${targetCities.length} il işlenecek (Tarih: ${dutyDate})...`);

  let currentBatchSql = ['PRAGMA foreign_keys = OFF;'];
  let batchCities = [];

  for (let i = 0; i < targetCities.length; i++) {
    const city = targetCities[i];
    if (i > 0) await sleep(800);

    try {
      console.log(`[${i + 1}/${targetCities.length}] ${city.name} (${city.code}) çekiliyor...`);
      const html = await fetchCity(city.code);
      const rows = parseCity(html, city.name);
      const { items } = toImportItems(rows, city, dutyDate);
      console.log(`  -> ${rows.length} eczane ayrıştırıldı, ${items.length} nöbetçi hazırlandı.`);

      const citySql = generateCitySql(items, city.code, dutyDate);
      currentBatchSql.push(...citySql);
      batchCities.push(city.name);

      // Her 10 ilde bir veya en son ilde D1'e yaz
      if (batchCities.length >= 10 || i === targetCities.length - 1) {
        await executeSql(currentBatchSql, batchCities.join(', '));
        currentBatchSql = ['PRAGMA foreign_keys = OFF;'];
        batchCities = [];
      }
    } catch (e) {
      console.error(`  ! ${city.name} (${city.code}) için hata:`, e.message);
    }
  }

  console.log('Tamamlandı!');
}

run().catch((e) => {
  console.error('Hata:', e);
  process.exit(1);
});
