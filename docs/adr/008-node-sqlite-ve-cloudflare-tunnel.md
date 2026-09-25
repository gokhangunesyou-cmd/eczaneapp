# ADR-008 — Node.js (Hono), SQLite ve Cloudflare Tunnel Mimarisi

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-25
- **Değiştirdiği kararlar:** ADR-003, ADR-006 (Cloudflare Workers + D1 + GitHub Actions bağımlılığı yerine bağımsız Node.js + SQLite + Cloudflare Tunnel)
- **Yeni Domain:** `https://nobetci-eczane.becayisler.com/` (Eski: `https://nobetcieczane.becayisler.com/`)

---

## Bağlam

Projenin ilk sürümlerinde Cloudflare Workers (workerd) üzerinde çalışan Hono API, Cloudflare D1 veritabanı ve veri çekimi için harici GitHub Actions iş akışları kurgulanmıştı (ADR-003, ADR-006).

Zaman içinde yaşanan operasyonel deneyimler şu kısıtları ortaya çıkardı:
1. **D1 ve Workers Kotaları & Kısıtları:** Ücretsiz Cloudflare planında CPU süre sınırları (10 ms/istek), alt istek (subrequest) limitleri ve D1 yazma/okuma sınırları, 81 ilin veri çekiminde ve yoğun sorgularda dar boğaz yaratabiliyordu.
2. **GitHub Actions Bağımlılığı:** Veri çekiminin GitHub Actions koşularına emanet edilmesi, runner IP'lerinin kaynak tarafından (Cloudflare WAF / 403) engellenmesi veya eylemlerin zaman zaman atlanması durumunda canlı verinin güncellenmemesine yol açıyordu.
3. **Müstakil ve Taşınabilir Altyapı İhtiyacı:** Veritabanının ve veri çekim sürecinin tek bir sunucu/konteyner (Coolify / Docker) içinde kendi kendine yeten, SQLite dosyasında kalıcı ve anlık cron zamanlayıcısıyla yönetilen bir yapıya kavuşturulması hedeflendi.

---

## Karar

1. **Uygulama Sunucusu (Node.js + Hono):**
   - `@hono/node-server` ile Node.js üzerinde doğrudan ayağa kalkan sunucu mimarisine geçildi (`src/node/server.ts`).
   - Tek bir Node.js süreci hem statik React/Vite arayüzünü (`dist/client`) hem de `/api/*` uçlarını servis eder.
   - Varsayılan port `3000`'dir (`PORT=3000`).

2. **Veritabanı (Gömülü SQLite + D1 Uyumlu Adaptör):**
   - Cloudflare D1 yerine yerel ve gömülü SQLite veritabanı kullanılmaya başlandı (`data/nobetci.sqlite`).
   - Node.js'in yerel `node:sqlite` (`DatabaseSync`) modülünü kullanan `SqliteD1Adapter` (`src/node/sqlite-adapter.ts`) yazıldı. Bu adaptör, `db.prepare().bind().all() / first() / run()` sözleşmesini birebir karşılar; böylece `src/worker/repo/*` altındaki tüm SQL sorguları ve doğrulama mantığı değiştirilmeden SQLite üzerinde çalışmaya devam eder.
   - `applyMigrations`: Sunucu başlangıcında `migrations/*.sql` dosyalarını otomatik olarak okur ve uygulanmamış olanları WAL modunda transaction ile işletir.

3. **Dahili Saatlik Çekim Zamanlayıcısı (In-Process Scheduler):**
   - GitHub Actions cron iş akışı yerine `server.ts` içinde yerleşik saatlik zamanlayıcı (`startHourlyScheduler`) devreye alındı.
   - Çevresel değişkenlerle (`AUTO_SCRAPE_HOURLY=true`, `AUTO_SCRAPE_MINUTE=5`, `AUTO_SCRAPE_ON_STARTUP`) yönetilir.
   - Her saat başından sonra (özellikle kaynağın 09:00 TRT rotasyonu gözetilerek) arka planda `scripts/scrape-eczaneler.mjs tum bugun` betiğini yerel API'ye karşı tetikler.

4. **Yayın ve Ağ (Cloudflare Tunnel):**
   - Sunucu yerelde / Coolify sunucusunda `http://127.0.0.1:3000` portunda dinler.
   - Dış dünyaya **Cloudflare Tunnel (`cloudflared`)** üzerinden güvenli tünel ile açılır.
   - Yeni resmi alan adı: **`https://nobetci-eczane.becayisler.com/`**
   - SSL sertifikası, DDoS koruması ve Cloudflare CDN kenar önbelleklemesi Cloudflare Tunnel üzerinden sağlanır; sunucunun doğrudan public IP açmasına gerek kalmaz.

---

## Sonuçlar

- **Tam Bağımsızlık:** Proje artık tamamen Docker veya Coolify üzerinde tek bir komutla (`docker compose up` veya `npm start`) ayağa kalkabilir.
- **Kalıcı ve Hızlı Veri:** SQLite WAL modunda çalıştığı için binlerce nöbetçi eczane sorgusu mikrosaniyeler mertebesinde yanıtlanır, harici bulut veritabanı kotalarına takılmaz.
- **Kesintisiz Veri Tazeliği:** Dahili scheduler sayesinde veri çekimi her saat otomatik gerçekleşir, sunucu başlangıcında veriler güncellenir.
- **Domain Güncellemesi:** Tüm SEO kanonik etiketleri, sitemap adresleri, MCP sunucu yapılandırmaları ve arayüz yönlendirmeleri yeni `https://nobetci-eczane.becayisler.com/` alan adına bağlandı.
