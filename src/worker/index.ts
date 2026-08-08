/**
 * Worker girişi — API + statik varlıklar tek deploy.
 *
 * Statik varlık istekleri Worker'a hiç uğramaz (wrangler.jsonc `run_worker_first`
 * yalnızca /api/* için açık); bu yüzden ücretsiz plandaki 100.000 istek/gün
 * kotasından yalnızca gerçek API çağrıları düşer.
 */

import { Hono } from 'hono';
import type { AppEnv } from './env';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { ApiError, internal } from './lib/errors';

const app = new Hono<AppEnv>().basePath('/api');

app.route('/', publicRoutes);
app.route('/admin', adminRoutes);

// Bilinmeyen API yolu — SPA fallback'ine düşmemeli.
app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Böyle bir uç yok.' } }, 404));

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
