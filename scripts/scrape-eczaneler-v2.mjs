#!/usr/bin/env node
/**
 * eczaneler.gen.tr v2 nöbetçi eczane çekim motoru.
 *
 *   node scripts/scrape-eczaneler-v2.mjs <il> [gun]
 *
 *   il    plaka kodu (7), slug (antalya) ya da `tum` (81 il)
 *   gun   `ikisi` (varsayılan: bugün + yarın), `bugun` ya da `yarin`
 *
 * Örnekler:
 *   node scripts/scrape-eczaneler-v2.mjs antalya
 *   node scripts/scrape-eczaneler-v2.mjs tum ikisi --api http://127.0.0.1:3000
 *   node scripts/scrape-eczaneler-v2.mjs 7 --dry-run
 */

import fs from 'fs';
import { chromium } from 'playwright-core';
import { slugify } from '../src/shared/slug.ts';
import { dutyDateOf, isoSeconds } from '../src/shared/duty.ts';
import { CITIES_81 } from '../src/shared/cities.ts';
import { extractRowsFromPane, extractCoordsFromMap, toImportItems } from './lib/eczaneler-v2-parse.mjs';

const BASE = 'https://www.eczaneler.gen.tr';
const IMPORT_CHUNK = 400;
const CONSECUTIVE_FAILURE_LIMIT = 5;

// ─── Argümanlar ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? (argv[i + 1]?.startsWith('--') === false ? argv[++i] : true);
    } else positional.push(a);
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));

if (positional.length < 1 || flags.help) {
  process.stderr.write(
    `\nKullanım: node scripts/scrape-eczaneler-v2.mjs <il> [gun]\n\n` +
      `  il    plaka kodu (7), slug (antalya) ya da "tum" (81 il)\n` +
      `  gun   "ikisi" (bugün + yarın, varsayılan), "bugun", "yarin"\n\n` +
      `Seçenekler:\n` +
      `  --dry-run        veritabanına yazma, ne bulduğunu göster\n` +
      `  --api <url>      API adresi (varsayılan http://localhost:5173)\n` +
      `  --user <ad>      panel kullanıcı adı (varsayılan ADMIN_USERNAME ya da admin)\n` +
      `  --pass <parola>  panel parolası (varsayılan ADMIN_PASSWORD ya da admin)\n` +
      `  --delay <ms>     istekler arası bekleme (varsayılan 1000)\n` +
      `  --headless       tarayıcıyı arkaplanda çalıştır (varsayılan true)\n\n`,
  );
  process.exit(positional.length < 1 ? 1 : 0);
}

const [ilArg, gunArg = 'ikisi'] = positional;
const API = String(flags.api ?? 'http://localhost:5173').replace(/\/$/, '');
const DELAY = Number(flags.delay ?? 1000);
const DRY = Boolean(flags['dry-run']);
const HEADLESS = Boolean(flags.headless); // Varsayılan: false (Cloudflare Turnstile bypass için)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Tarayıcı Yolu Tespiti ──────────────────────────────────────────────────

function resolveChromiumPath() {
  const envPath = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    '/usr/bin/chromium-browser', // Alpine Linux paketi
    '/usr/bin/chromium',         // Debian/Ubuntu paketi
    '/usr/bin/google-chrome',    // Linux Chrome
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS Chrome
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined; // Playwright'ın kendi indirilen motoruna düş
}

// ─── API İstemcisi ──────────────────────────────────────────────────────────

let apiCookie = '';

async function apiLogin() {
  if (DRY) return;
  const username = flags.user ?? process.env.ADMIN_USERNAME ?? 'admin';
  const password = flags.pass ?? process.env.ADMIN_PASSWORD ?? 'admin';

  const res = await fetch(`${API}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 204) {
    throw new Error(
      `Panel girişi başarısız (HTTP ${res.status}). --user/--pass ver ya da ` +
        `ADMIN_USERNAME / ADMIN_PASSWORD ortam değişkenlerini ayarla.`,
    );
  }
  apiCookie = (res.headers.getSetCookie?.()[0] ?? '').split(';')[0];
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: apiCookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function recordRun(run) {
  if (DRY) return;
  try {
    await apiPost('/api/admin/scrape/runs', run);
  } catch (e) {
    process.stderr.write(`  ! koşu kaydı yazılamadı: ${e.message}\n`);
  }
}

// ─── Tek İl Çekimi ──────────────────────────────────────────────────────────

async function scrapeCity(city, page, now) {
  const startedAt = isoSeconds(now);
  const todayDate = dutyDateOf(now);
  const tomorrowDate = dutyDateOf(new Date(now.getTime() + 86_400_000));

  const listUrl = `${BASE}/nobetci-${city.slug}`;
  const mapUrl = `${BASE}/nobetci-${city.slug}?harita=1`;

  // 1. Liste sayfasını çek
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(DELAY);

  let title = await page.title();
  if (title.includes('Just a moment') || title.includes('Bir dakika') || title.includes('Attention Required')) {
    // Cloudflare turnstile bekle
    await page.waitForTimeout(5000);
    title = await page.title();
  }

  const listHtml = await page.content();
  if (DRY) console.log(`  [debug] Title: "${title}", HTML length: ${listHtml.length}`);

  // 2. Harita sayfasını çek (koordinatlar için)
  let mapHtml = '';
  try {
    await page.goto(mapUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(600);
    mapHtml = await page.content();
  } catch (err) {
    process.stderr.write(`  (harita alınamadı: ${err.message})`);
  }

  const coordsMap = extractCoordsFromMap(mapHtml);

  // 3. Günleri ayrıştır
  const daysToProcess = [];
  if (gunArg === 'ikisi' || gunArg === 'bugun') {
    daysToProcess.push({ paneId: 'nav-bugun', dutyDate: todayDate, label: 'bugün' });
  }
  if (gunArg === 'ikisi' || gunArg === 'yarin') {
    daysToProcess.push({ paneId: 'nav-yarin', dutyDate: tomorrowDate, label: 'yarın' });
  }

  let totalRows = 0;
  let totalWithCoords = 0;
  let totalImportedDuties = 0;

  for (const day of daysToProcess) {
    const rows = extractRowsFromPane(listHtml, day.paneId);
    if (rows.length === 0) continue;

    totalRows += rows.length;
    const { items, skipped } = toImportItems(rows, coordsMap, city, day.dutyDate);
    const withCoords = items.filter((i) => i.lat !== null).length;
    totalWithCoords += withCoords;

    if (!DRY && items.length > 0) {
      for (let i = 0; i < items.length; i += IMPORT_CHUNK) {
        const part = await apiPost('/api/admin/import', {
          cityCode: city.code,
          dutyDate: day.dutyDate,
          source: 'edevlet',
          items: items.slice(i, i + IMPORT_CHUNK),
        });
        totalImportedDuties += part?.dutiesWritten ?? 0;
      }
    }
  }

  await recordRun({
    cityCode: city.code,
    dutyDate: todayDate,
    startedAt,
    outcome: totalRows > 0 ? 'ok' : 'partial',
    rowsFound: totalRows,
    pharmaciesNew: 0,
    dutiesWritten: totalImportedDuties,
    coordsFetched: totalWithCoords,
    rowsSkipped: 0,
    errorMessage: null,
  });

  return {
    city,
    rowsFound: totalRows,
    withCoords: totalWithCoords,
    importedDuties: totalImportedDuties,
  };
}

// ─── Ana Akış ───────────────────────────────────────────────────────────────

async function main() {
  await apiLogin();

  let allCities = CITIES_81;
  if (!DRY) {
    try {
      const res = await fetch(`${API}/api/cities`);
      if (res.ok) allCities = (await res.json()).items;
    } catch (e) {
      process.stderr.write(`  (API /api/cities ulaşılamadı, yerel il listesi kullanılıyor: ${e.message})\n`);
    }
  }

  const wantsAll = ['tum', 'tümü', 'tumu', 'all', 'turkiye', 'türkiye'].includes(
    ilArg.toLowerCase(),
  );

  let cities;
  if (wantsAll) {
    cities = allCities;
  } else {
    const one = /^\d+$/.test(ilArg)
      ? allCities.find((c) => c.code === Number(ilArg))
      : allCities.find((c) => c.slug === slugify(ilArg));
    if (!one) throw new Error(`İl bulunamadı: "${ilArg}". Plaka kodu, slug ya da "tum" ver.`);
    cities = [one];
  }

  const now = new Date();
  const execPath = resolveChromiumPath();

  console.log(
    `\n▸ ${cities.length} il  ·  gün seçimi: ${gunArg}  ·  bugün: ${dutyDateOf(now)}` +
      `  ·  hedef: ${DRY ? '(dry-run — yazılmayacak)' : API}`,
  );
  console.log(`  tarayıcı: ${execPath || '(playwright varsayılanı)'}\n`);

  const userDataDir = process.env.CHROME_USER_DATA_DIR || '/tmp/chrome-scraper-profile';
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: execPath,
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  let consecutive = 0;
  const results = [];
  const failures = [];

  for (const city of cities) {
    try {
      const r = await scrapeCity(city, page, now);
      results.push(r);
      consecutive = 0;
      console.log(
        `  ${city.name.padEnd(16)} ${String(r.rowsFound).padStart(3)} eczane` +
          `  ${String(r.withCoords).padStart(3)} koordinat` +
          (DRY ? '  (dry-run)' : `  ${r.importedDuties} nöbet`),
      );
    } catch (e) {
      consecutive++;
      failures.push({ city, error: e.message });
      console.log(`  ${city.name.padEnd(16)} — HATA: ${e.message}`);
      if (consecutive >= CONSECUTIVE_FAILURE_LIMIT) {
        console.error(`\nÇEKİM YARIDA KESİLDİ: ${consecutive} il üst üste başarısız.`);
        break;
      }
    }
  }

  await context.close();

  console.log('\n─────────────────────────────────');
  console.log(`  başarılı il : ${results.length} / ${cities.length}`);
  console.log(`  toplam eczane : ${results.reduce((a, b) => a + b.rowsFound, 0)}`);
  console.log(`  koordinatlı : ${results.reduce((a, b) => a + b.withCoords, 0)}`);
  console.log('─────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\nÖlümcül hata:', err.message);
  process.exit(1);
});
