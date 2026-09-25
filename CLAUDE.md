# Nöbetçi Eczane

Web + kurulabilir PWA. Tek hedef: sıfır tıkla en yakın nöbetçi eczaneyi göstermek.

## Mimari

Uygulama **Node.js (Hono) sunucusu (`src/node/server.ts`)** üzerinde çalışır ve dış dünyaya **Cloudflare Tunnel (`cloudflared`)** üzerinden güvenli bir şekilde bağlanır (ADR-008).

- **Sunucu & API:** `@hono/node-server` ile yerel port 3000'de dinler (`npm start`). Hem API uçlarını (`/api/*`) hem de statik React/Vite arayüzünü (`dist/client`) servis eder.
- **Veritabanı:** Yerel gömülü SQLite veritabanı (`data/nobetci.sqlite`) kullanılır. `src/node/sqlite-adapter.ts` üzerinden Cloudflare D1 arayüzü ile %100 uyumlu `DatabaseSync` adaptörü çalışır. Sunucu başlangıcında `migrations/*.sql` otomatik uygulanır.
- **Veri Çekimi & Otomasyon:** Veri resmi `e-Devlet` (TİTCK) kaynağından doğrudan ve güvenli biçimde çekilir (ADR-005). `server.ts` içindeki dahili saatlik zamanlayıcı (`startHourlyScheduler`) her saat başından sonra `scripts/scrape-edevlet.mjs tum bugun` betiğini otomatik çalıştırır. Herhangi bir harici API anahtarına veya ScraperAPI proxy'sine ihtiyaç duymaz.
- **Yayın & Ağ:** Cloudflare Tunnel ile internete açılmıştır. Canlı alan adı: **`https://nobetci-eczane.becayisler.com`**
- **Yedek / Edge Modu:** Kod tabanı halen Cloudflare Workers (workerd) ve D1 (`wrangler dev`, `wrangler deploy`) ile tam uyumludur.
- **Harita & Yol Tarifi:** MapLibre + MapTiler; yol tarifi native harita uygulamasına deep link.
- **Kapsam:** 81 il. Kullanıcının ili **konumdan çözülür** (en yakın eczanenin ili; yedek yol il merkezleri).
- **Canlı Domain:** `nobetci-eczane.becayisler.com`

## Dizin

    contracts/openapi.yaml     API sözleşmesi — tek doğru kaynak, tipler buradan üretilir
    design/                    onaylı tasarım (.html) + çıkarılmış DESIGN-TOKENS.md
    docs/adr/                  mimari karar kayıtları (001–008; 007 kaynak, 008 Node/Tunnel)
    src/node/                  Node.js sunucusu (server.ts), SQLite adaptörü (sqlite-adapter.ts)
    src/worker/                Hono API, zod şemaları, veritabanı repo katmanı (repo/)
    src/app/                   React arayüz — screens/, components/, admin/
    src/shared/                paylaşılan kod (geo, duty) + üretilen api-types
    data/                      SQLite veritabanı dizini (nobetci.sqlite)
    migrations/  seed/         Veritabanı şeması ve test tohumları
    scripts/                   Scraping betikleri, parola hash, font ve ikon üretimi
    tests/e2e/                 Playwright smoke testleri

## Komutlar

    npm run dev          Vite geliştirme sunucusu
    npm start            Node.js prodüksiyon sunucusu (Hono + SQLite + Scheduler)
    npm run build        Vite client derlemesi (dist/client)
    npm run test         Vitest test havuzu
    npm run test:e2e     Playwright smoke
    npm run lint         tsc -b + eslint + prettier --check
    npm run gen:types    openapi.yaml → src/shared/api-types.d.ts
    npm run scrape -- tum            günlük çekim (81 il, yerel API'ye yazar)
    npm run scrape -- 7 --dry-run --sample 3   yazmadan dene, ne bulduğunu gör
    npm run mcp          MCP (Model Context Protocol) sunucusunu başlatır

## Kurallar

- **`.dev.vars` ve `.env*` dosyalarına asla dokunma.** Okuma, yazma, kopyalama, `cat`
  etme. Yeni değişken gerekiyorsa `.dev.vars.example` / `.env.example`'a yorumuyla ekle,
  gerçek değeri kullanıcı kendi dosyasına yazsın.
- **`wrangler ... --remote` ve prod deploy'u asla kendin çalıştırma.** `d1 execute
--remote`, `deploy`, `secret put`, `d1 delete` dahil. Komutu hazırla, kullanıcı çalıştırsın.
- **Yeni npm paketi eklemeden önce sor.** Adı, ne işe yaradığı, boyutu ve neden mevcut
  bağımlılıklarla çözülemediği; onay bekle.
- **Tasarım kararı üretme.** Renk, boşluk, tipografi, radius, hareket — hepsi
  `design/DESIGN-TOKENS.md`'de. Yoksa tasarım HTML'ine bak; orada da yoksa sor.

## Sözleşme ve kota

API'de bir şey değişecekse **önce `contracts/openapi.yaml`** değişir, sonra
`npm run gen:types`, sonra kod. Elle tip yazılmaz.

Ücretsiz plan sınırlarına yakın çalışıyoruz. En dar kalemler: Workers CPU 10 ms/istek,
D1 satır okuma 5M/gün, MapTiler 100k yükleme/ay. İstek yolunda ağır işlem yapma,
`SELECT *` ve `LIMIT`siz sorgu yazma, yanıtlardaki `Cache-Control` başlıklarını kaldırma.
Zaman karşılaştırmaları metin üzerinden yapılır: D1'e bağlanan tarih **milisaniyesiz**
`YYYY-MM-DDTHH:MM:SSZ` olmalı, SQLite `datetime()` SQL'de kullanılmaz.
Ayrıntı: `docs/adr/003-veri-tazeleme.md`, `docs/adr/005-edevlet-scraping.md`,
`docs/adr/006-turkiye-geneli-ve-gunluk-otomasyon.md`,
`docs/adr/007-eczaneler-gen-tr-kaynagi.md`

Kaynağa giden her istek sıralı ve aralıklıdır; günde birkaç koşudan fazlası
yapılmaz. Sınırlar ADR-005'te, mevcut kaynağın kendine has kısıtları ADR-007'de.

`duty_shift.source` ve `pharmacy.coord_source` alanlarındaki `'edevlet'` değeri
artık **kaynağın adı değil, "otomatik çekim" kovasının adıdır** — `'manual'`
olandan ayırır ve elle girileni korur. Yeniden adlandırmak şema göçü istiyor;
gerekçe ve borç kaydı ADR-007'de.
