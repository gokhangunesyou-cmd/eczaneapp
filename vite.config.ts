import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Tek `vite` komutu hem React arayüzünü hem Worker'ı (gerçek workerd içinde)
// çalıştırır. Ayrı bir `wrangler dev` süreci gerekmez.
export default defineConfig({
  plugins: [
    react(),

    cloudflare({
      configPath: './wrangler.jsonc',
    }),

    VitePWA({
      // GEÇİCİ TEŞHİS: service worker'ın haritayı bozup bozmadığını ayırmak için.
      disable: process.env.PWA_OFF === '1',
      // 'prompt' yerine 'autoUpdate': bozuk bir service worker yayınlanırsa
      // düzeltmenin kullanıcıya ULAŞMASI gerekiyor. 'prompt' ile kullanıcı
      // güncellemeyi onaylamazsa bozuk sürümde kalıyor — bu bir kez yaşandı.
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // Tasarım koyu tema birincil — kurulum ekranı ve durum çubuğu buna uyar.
      // Değerler design/DESIGN-TOKENS.md'den; burada elle değiştirilmez.
      manifest: {
        name: 'Nöbetçi Eczane',
        short_name: 'nöbetçi',
        description: 'En yakın nöbetçi eczaneyi hemen göster.',
        lang: 'tr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B1015',
        theme_color: '#0B1015',
        categories: ['health', 'medical', 'navigation'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Fontlar self-host — Google Fonts CDN'i çevrimdışı çalışmaz.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // MapLibre (~940 KB) lazy yüklenir; ilk açılışta gerekmez ve precache'i
        // gereksiz şişirir. Kullanıldığında runtime cache'e düşer.
        globIgnores: ['**/MapView-*.{js,css}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // Nöbetçi eczane listesi: önce ağ, başarısızsa son bilinen liste.
            // Tasarımdaki "07 Çevrimdışı" ekranını besleyen kaynak budur.
            urlPattern: /^.*\/api\/pharmacies\/on-duty.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'on-duty-v1',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // İlçe listesi günde bir değişir; önce cache, arkada tazele.
            urlPattern: /^.*\/api\/districts.*$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'districts-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // MapTiler İÇİN RUNTIME CACHE YOK — bilerek.
          //
          // Daha önce burada `CacheFirst` + `cacheableResponse: [0, 200]` vardı ve
          // HARİTAYI TAMAMEN BOZDU: MapLibre karoları bir web worker'dan çekiyor,
          // service worker araya giriyor, çapraz kaynaklı yanıt OPAK (status 0)
          // olarak cache'leniyor ve MapLibre opak yanıtın gövdesini okuyamıyor.
          // Sonuç: canlıda boş lacivert zemin, yerelde (SW yokken) sorunsuz harita.
          //
          // Karo önbellekleme zaten tarayıcının HTTP cache'i tarafından yapılıyor;
          // MapTiler doğru cache başlıklarını gönderiyor. Buraya bir kural
          // eklenecekse `statuses: [200]` olmalı ve gerçek cihazda doğrulanmalı.
          // Çevrimdışı senaryomuz zaten haritaya değil LİSTEYE dayanıyor (tasarım 07).
        ],
      },

      devOptions: { enabled: false },
    }),
  ],

  resolve: {
    alias: {
      '@app': path.resolve(import.meta.dirname, './src/app'),
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
    },
  },

  build: {
    // outDir AYARLANMAZ. @cloudflare/vite-plugin çıktı düzenini kendi kurar:
    //   dist/client/          → statik varlıklar (wrangler.jsonc assets.directory)
    //   dist/<worker-adı>/    → Worker paketi
    // Elle ezilirse dist/client/client gibi iç içe bir dizin oluşur.
    sourcemap: false,
    // Ücretsiz plan: Worker paketi 3 MB (gzip) sınırı. Uyarı eşiği erken.
    // MapLibre ~220 KB gzip. Ana bundle'a GİRMEZ: MapView `React.lazy` ile
    // yüklendiği için kendi chunk'ına ayrılır ve ilk ekran (izin) haritasız
    // açılır. Elle manualChunks tanımına gerek yok. Bkz. docs/adr/002.
    chunkSizeWarningLimit: 300,
  },
});
