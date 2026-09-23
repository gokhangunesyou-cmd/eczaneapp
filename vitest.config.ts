import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

// Vitest 4: `test.projects` — vitest.workspace.ts kaldırıldı.
//
// İki ayrı çalışma ortamı:
//   app     → jsdom, React komponentleri
//   worker  → gerçek workerd + gerçek D1 (Miniflare). Mock D1 YAZILMAZ —
//             mock'a karşı geçen test üretimde yalan söyler.
const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

const alias = {
  '@app': path.resolve(import.meta.dirname, './src/app'),
  '@worker': path.resolve(import.meta.dirname, './src/worker'),
  '@shared': path.resolve(import.meta.dirname, './src/shared'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'app',
          environment: 'jsdom',
          globals: true,
          // Çekim komutunun ayrıştırıcısı da burada koşar: Worker'a girmiyor,
          // ağa çıkmıyor, kaydedilmiş gerçek HTML'e karşı çalışıyor (ADR-007).
          include: [
            'src/app/**/*.test.{ts,tsx}',
            'src/shared/**/*.test.ts',
            'src/mcp/**/*.test.ts',
            'scripts/**/*.test.mjs',
          ],
          setupFiles: ['./tests/setup-app.ts'],
          restoreMocks: true,
        },
      },
      {
        resolve: { alias },
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              // Şema her test dosyasının izole D1'ine uygulanır.
              // Testler ağa çıkmaz: dış fetch yapan kod yok (ADR-004).
              bindings: {
                TEST_MIGRATIONS: migrations,
                // Secret'ların TEST karşılıkları. Gerçek değer DEĞİL — üretimde
                // wrangler secret'tan gelir, geliştirmede .dev.vars'tan.
                // ADMIN_PASSWORD_HASH testin kendisinde üretilip yazılır
                // (parola "test"), çünkü hash koda sabitlenmez.
                ADMIN_USERNAME: 'test',
                ADMIN_PASSWORD_HASH: 'pbkdf2$sha256$210000$AAAA$AAAA',
                SESSION_SECRET: 'test-only-not-a-real-secret-0123456789',
                SESSION_TTL_SECONDS: '3600',
              },
            },
          }),
        ],
        test: {
          name: 'worker',
          globals: true,
          include: ['src/worker/**/*.test.ts'],
          setupFiles: ['./tests/setup-worker.ts'],
          restoreMocks: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/shared/api-types.d.ts', 'src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
    },
  },
});
