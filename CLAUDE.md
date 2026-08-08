# Nöbetçi Eczane

Web + kurulabilir PWA. Tek hedef: sıfır tıkla en yakın nöbetçi eczaneyi göstermek.

## Mimari

Tek Cloudflare Worker; hem API'yi hem statik varlıkları servis eder.
**Veri eczaneler.gen.tr'den çekilir (ADR-007), çekim Cloudflare'in DIŞINDA koşar
(ADR-006):** GitHub Actions günde iki kez — 08:15 ve 14:00 TRT, ikisi de nöbetin
döndüğü 08:00'den SONRA — `npm run scrape` çalıştırır, sonucu `/api/admin/import`
ucuna yazar. Kaynak koordinatı listenin içinde veriyor: il başına tek istek.
Kaynak **yalnızca bugünü** ve **nöbet saatlerini vermeden** sunuyor; saatler
`src/shared/duty.ts`'teki rotasyon modelinden türetilir (ADR-007). e-Devlet
komutu `npm run scrape:edevlet` olarak yedekte durur (ADR-005).
Worker'ın tek dış isteği panelin tetikleme düğmesidir. Panel elle
düzeltme yolu olarak durur — elle girilen koordinat ve nöbet çekimle ezilmez.
D1 kayıt otoritesidir; okuma yolu D1 + edge cache. Panel: `/admin`.
Harita MapLibre + MapTiler; yol tarifi native harita uygulamasına deep link.
Kapsam 81 il. Kullanıcının ili **konumdan çözülür** (en yakın eczanenin ili;
yedek yol il merkezleri) — reverse geocoding yok, MapTiler kotası harcanmaz.
`SUPPORTED_CITY_CODE` artık kapı değil, yalnızca varsayılan il.
Prod: nobetcieczane.becayisler.com

## Dizin

    contracts/openapi.yaml     API sözleşmesi — tek doğru kaynak, tipler buradan üretilir
    design/                    onaylı tasarım (.html) + çıkarılmış DESIGN-TOKENS.md
    docs/adr/                  mimari karar kayıtları (001–007; 006+007 mevcut veri akışı)
    .github/workflows/         günlük çekim (scrape.yml) — ADR-006, kaynak ADR-007
    src/worker/                Hono API, zod şemaları, D1 erişimi (repo/)
    src/app/                   React arayüz — screens/, components/, admin/
    src/shared/                paylaşılan kod (geo, duty) + üretilen api-types
    migrations/  seed/         D1 şeması · geliştirme için SAHTE veri
    scripts/                   hook script'leri, parola hash, font ve ikon üretimi
    tests/e2e/                 Playwright smoke (3 test, artırma)

## Komutlar

    npm run dev          Vite + Worker (gerçek workerd) tek komutta
    npm run test         Vitest (workerd havuzu, gerçek D1)
    npm run test:e2e     Playwright smoke
    npm run lint         tsc -b + eslint + prettier --check
    npm run gen:types    openapi.yaml → src/shared/api-types.d.ts
    npm run cf-typegen   wrangler.jsonc → worker-configuration.d.ts
    npm run db:reset     yerel D1'i sıfırla + migration + sahte veri
    npm run scrape -- tum            günlük çekim (81 il, yalnızca bugün)
    npm run scrape -- 7 --dry-run --sample 3   yazmadan dene, ne bulduğunu gör
    npm run scrape:edevlet -- 7 ikisi     yedek kaynak, nöbet saatlerini de verir
    npm run check        lint + test + build + deploy --dry-run
    npm run deploy       ← bunu KULLANICI çalıştırır

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
