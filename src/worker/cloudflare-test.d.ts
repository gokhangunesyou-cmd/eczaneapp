/**
 * Ortam tipinin secret ve test-only alanları.
 *
 * `worker-configuration.d.ts` wrangler tarafından ÜRETİLİR (`npm run cf-typegen`)
 * ve yalnızca wrangler.jsonc'de tanımlı binding'leri bilir. Secret'lar oraya
 * yazılmaz (yazılmamalı da), test binding'leri de öyle. Eksik alanlar burada
 * beyan edilir.
 *
 * `cloudflare:test` modülünün `env` nesnesi `Cloudflare.Env` tipindedir;
 * bu yüzden augment edilen yer o namespace.
 */

import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      // Secret'lar — .dev.vars (geliştirme) / wrangler secret (production)
      ADMIN_USERNAME: string;
      ADMIN_PASSWORD_HASH: string;
      SESSION_SECRET: string;
      SESSION_TTL_SECONDS?: string;

      // Panelden çekim tetikleme (ADR-006). İkisi de yoksa uç 503 döner.
      GITHUB_REPO?: string;
      GITHUB_DISPATCH_TOKEN?: string;

      // Yalnızca test: migration listesi vitest.config.ts'ten enjekte edilir.
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
