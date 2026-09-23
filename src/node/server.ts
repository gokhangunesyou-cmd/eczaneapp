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

function triggerLocalScrape(scope: string, days: string) {
  const scriptPath = path.resolve(process.cwd(), 'scripts/scrape-eczaneler.mjs');
  if (!fs.existsSync(scriptPath)) {
    console.error(`[Scraper] Betik bulunamadı: ${scriptPath}`);
    return;
  }
  const apiUrl = `http://127.0.0.1:${port}`;
  const args = [scriptPath, scope, days, '--api', apiUrl];
  console.log(`[Scraper] Arka planda yerel çekim başlatılıyor: node ${args.join(' ')}`);

  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    },
    detached: true,
    stdio: 'inherit',
  });
  child.unref();
}

// Cloudflare Worker ortam değişkenlerini simüle et
const envBindings: AppEnv['Bindings'] = {
  DB: db as any,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
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
