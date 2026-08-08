/**
 * Worker'ın ortam bağlamı.
 *
 * Binding'ler ve vars `worker-configuration.d.ts` içinde wrangler tarafından
 * ÜRETİLİR (`npm run cf-typegen`). Secret alanları `cloudflare-test.d.ts`
 * içinde augment edilir.
 *
 * Gizli değerler burada TİP olarak durur, DEĞER olarak değil. Değerler
 * .dev.vars (geliştirme) ve wrangler secret (production) üzerinden gelir.
 */

export type Env = Cloudflare.Env;

/** Hono bağlamına eklenen değişkenler. */
export type Variables = {
  /** Admin middleware'i tarafından set edilir. */
  adminUser: string;
};

export type AppEnv = { Bindings: Env; Variables: Variables };
