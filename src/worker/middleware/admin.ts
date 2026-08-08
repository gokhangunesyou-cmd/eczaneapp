/** Admin oturum doğrulama middleware'i. */

import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { readCookie, verifySession, SESSION_COOKIE } from '../lib/auth';
import { unauthorized } from '../lib/errors';

/**
 * Oturum çerezini doğrular ve kullanıcı adını bağlama yazar.
 * Route içinde elle çerez kontrolü YAZILMAZ — hepsi buradan geçer.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE);
  if (!token) throw unauthorized();

  const session = await verifySession(token, c.env.SESSION_SECRET, new Date());
  if (!session) throw unauthorized('Oturumun sona ermiş. Tekrar giriş yap.');

  c.set('adminUser', session.u);
  await next();
});
