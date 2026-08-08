import { defineConfig, devices } from '@playwright/test';

// Smoke testler. TOPLAM 3 TESTİ GEÇMEZ — ayrıntı Vitest'in işi.
// Yerel `vite` sunucusuna karşı koşar; ağa çıkan test yoktur (kaynak = fixture).
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    // Konum izni testlerinde kullanılır; testler kendi context'inde
    // grantPermissions/clearPermissions ile izinli ve izinsiz akışı ayırır.
    geolocation: { latitude: 36.8969, longitude: 30.7133 }, // Antalya merkez
  },

  projects: [
    {
      // Ürün mobil-öncelikli; tasarım referansı 390×844.
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
