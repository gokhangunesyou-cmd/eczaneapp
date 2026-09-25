import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createSqliteDb } from './sqlite-adapter';
import app from '../worker/index';
import type { AppEnv } from '../worker/env';

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'data/nobetci.sqlite');
const migrationsDir = path.resolve(process.cwd(), 'migrations');

console.log(`[Server] Başlatılıyor... Port: ${port}`);
console.log(`[Server] Veritabanı konumu: ${dbPath}`);

// SQLite veritabanını ve otomatik migration'ları hazırla
const db = createSqliteDb(dbPath, migrationsDir);

let isScrapingInProgress = false;

function triggerLocalScrape(scope: string, days: string) {
  if (isScrapingInProgress) {
    console.log(`[Scraper] Zaten aktif bir çekim işlemi çalışıyor, yeni istek atlandı.`);
    return;
  }
  const scriptPath = path.resolve(process.cwd(), 'scripts/scrape-edevlet.mjs');
  if (!fs.existsSync(scriptPath)) {
    console.error(`[Scraper] Betik bulunamadı: ${scriptPath}`);
    return;
  }
  const apiUrl = `http://127.0.0.1:${port}`;
  const args = [scriptPath, scope, days, '--api', apiUrl];
  console.log(`[Scraper] Arka planda yerel çekim başlatılıyor: node ${args.join(' ')}`);

  isScrapingInProgress = true;
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    isScrapingInProgress = false;
    console.log(`[Scraper] Çekim işlemi tamamlandı (çıkış kodu: ${code}).`);
  });

  child.on('error', (err) => {
    isScrapingInProgress = false;
    console.error(`[Scraper] Çekim alt işlemi hatası:`, err);
  });
}

function startHourlyScheduler() {
  const isEnabled = process.env.AUTO_SCRAPE_HOURLY !== 'false';
  if (!isEnabled) {
    console.log('[Scheduler] Saatlik otomatik çekim devre dışı (AUTO_SCRAPE_HOURLY=false).');
    return;
  }

  // Varsayılan: her saatin 5. dakikası (08:05, 09:05 vb. - rotasyondan 5 dk sonra)
  const targetMinute = Number(process.env.AUTO_SCRAPE_MINUTE || 5);

  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    if (now.getMinutes() >= targetMinute) {
      next.setHours(now.getHours() + 1);
    }
    next.setMinutes(targetMinute, 0, 0);

    const delayMs = next.getTime() - now.getTime();
    const minutesLeft = Math.round(delayMs / 60000);
    console.log(`[Scheduler] Bir sonraki saatlik çekim: ${next.toLocaleTimeString('tr-TR')} (~${minutesLeft} dakika sonra)`);

    setTimeout(() => {
      console.log(`[Scheduler] Saatlik otomatik çekim tetikleniyor (${new Date().toLocaleTimeString('tr-TR')})...`);
      triggerLocalScrape('tum', 'bugun');
      scheduleNext();
    }, delayMs);
  }

  console.log(`[Scheduler] Saatlik otomatik çekim zamanlayıcısı devrede (her saat ${targetMinute}. dakikada çalışacak).`);
  scheduleNext();

  if (process.env.AUTO_SCRAPE_ON_STARTUP === 'true') {
    console.log('[Scheduler] Sunucu başlangıcında ilk çekim tetikleniyor (AUTO_SCRAPE_ON_STARTUP=true)...');
    setTimeout(() => triggerLocalScrape('tum', 'bugun'), 5000);
  }
}

async function getAdminPasswordHash(): Promise<string> {
  const envHash = process.env.ADMIN_PASSWORD_HASH || '';
  // Eğer hash düzgün verilmişse (en az 3 tane $ içeriyorsa) kullan
  if (envHash.split('$').length >= 5) {
    return envHash;
  }
  // Docker Compose $ interpolation yüzünden bozulmuşsa veya sadece ADMIN_PASSWORD verilmişse
  const password = process.env.ADMIN_PASSWORD;
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 60000 },
      key,
      256,
    );
    const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf).toString('base64');
    return `pbkdf2$sha256$60000$${b64(salt)}$${b64(bits)}`;
  }
  return envHash;
}

const adminPasswordHash = await getAdminPasswordHash();

// Cloudflare Worker ortam değişkenlerini simüle et
const envBindings: AppEnv['Bindings'] = {
  DB: db as any,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD_HASH: adminPasswordHash,
  SESSION_SECRET: process.env.SESSION_SECRET || 'nobetci-session-secret-change-in-production-1234567890',
  SESSION_TTL_SECONDS: process.env.SESSION_TTL_SECONDS || '604800',
  SUPPORTED_CITY_CODE: process.env.SUPPORTED_CITY_CODE || '7',
  DUTY_ROTATION_HOUR_TRT: process.env.DUTY_ROTATION_HOUR_TRT || '8',
  CACHE_MAX_TTL_SECONDS: process.env.CACHE_MAX_TTL_SECONDS || '900',
  SOURCE_DAILY_QUOTA: process.env.SOURCE_DAILY_QUOTA || '10',
  ANTALYA_EO_BASE_URL: process.env.ANTALYA_EO_BASE_URL || 'https://www.antalyaeo.org.tr/nobetcieczaneler.xml',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ASSETS: undefined as any,
  GITHUB_REPO: '',
  GITHUB_DISPATCH_TOKEN: '',
  LOCAL_SCRAPE: '1',
  TRIGGER_SCRAPE_FN: triggerLocalScrape,
} as any;

const server = new Hono();

// Statik varlıkların servis edilmesi (React SPA)
const clientDist = path.resolve(process.cwd(), 'dist/client');

if (fs.existsSync(clientDist)) {
  console.log(`[Server] Statik React varlıkları servis ediliyor: ${clientDist}`);
  server.use('/assets/*', serveStatic({ root: './dist/client' }));
  server.use('/icons/*', serveStatic({ root: './dist/client' }));
  server.use('/fonts/*', serveStatic({ root: './dist/client' }));
  server.use('/manifest.webmanifest', serveStatic({ root: './dist/client' }));
  server.use('/sw.js', serveStatic({ root: './dist/client' }));
  server.use('/registerSW.js', serveStatic({ root: './dist/client' }));
  server.use('/favicon.ico', serveStatic({ root: './dist/client' }));
}

// API ve SEO rotalarını Worker (Hono) uygulamasına yönlendir
server.all('/api/*', (c) => app.fetch(c.req.raw, envBindings));
server.get('/sitemap.xml', (c) => app.fetch(c.req.raw, envBindings));
server.get('/robots.txt', (c) => app.fetch(c.req.raw, envBindings));

// React SPA Yönlendirmesi: Diğer tüm GET istekleri index.html'e düşer
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  server.get('*', serveStatic({ path: './dist/client/index.html' }));
} else {
  server.get('/', (c) => c.text('Nobetci Eczane API calisiyor (Arayuz icin npm run build calistirin).'));
}

serve({
  fetch: server.fetch,
  port,
});

console.log(`[Server] Sunucu http://0.0.0.0:${port} üzerinde dinlemede.`);

// Saatlik otomatik nöbetçi eczane çekim zamanlayıcısını başlat
startHourlyScheduler();
