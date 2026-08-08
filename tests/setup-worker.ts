import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// Worker testleri için ortak kurulum.
// Gerçek workerd + gerçek D1 (Miniflare) — mock yok.
// `cloudflare:test` ortam tipleri: src/worker/cloudflare-test.d.ts

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
