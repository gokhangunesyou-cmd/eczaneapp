/**
 * Worker girişi — API, SEO varlıkları + statik varlıklar tek deploy.
 */

import { Hono } from 'hono';
import type { AppEnv } from './env';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { seoRoutes } from './routes/seo';
import { ApiError, internal } from './lib/errors';

const app = new Hono<AppEnv>();

// SEO kök yolları (/sitemap.xml, /robots.txt)
app.route('/', seoRoutes);

// API yolları (/api/*)
const api = new Hono<AppEnv>();
api.route('/', publicRoutes);
api.route('/admin', adminRoutes);

app.route('/api', api);

// Bilinmeyen API yolu — SPA fallback'ine düşmemeli.
app.notFound((c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: { code: 'not_found', message: 'Böyle bir uç yok.' } }, 404);
  }
  return c.text('Not Found', 404);
});

/**
 * Tek hata çıkışı. Ham hata İSTEMCİYE SIZMAZ: stack trace, SQL metni ve
 * dosya yolu asla yanıta girmez. Beklenmeyen hatalar sunucu tarafında loglanır.
 */
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(err.toBody(), err.status as 400, { 'Cache-Control': 'no-store' });
  }

  console.error('unhandled', {
    path: new URL(c.req.url).pathname,
    method: c.req.method,
    message: err instanceof Error ? err.message : String(err),
  });

  return c.json(internal().toBody(), 500, { 'Cache-Control': 'no-store' });
});

export default app;
