# 🏥 Nöbetçi Eczane

Türkiye'nin 81 ili için sıfır tıkla en yakın nöbetçi eczaneyi gösteren, modern, hafif ve hızlı web uygulaması ve kurulabilir PWA.

🌐 **Canlı Uygulama:** [https://nobetci-eczane.becayisler.com/](https://nobetci-eczane.becayisler.com/)

---

## ⚡ Temel Özellikler

- **🎯 Sıfır Tık Deneyimi:** Konum izni verildiğinde anında en yakın nöbetçi eczaneleri mesafe ve tahmini yürüme/araç süresiyle listeler.
- **📍 81 İl ve Tüm İlçeler:** Türkiye genelindeki tüm il ve ilçelerde güncel nöbet listeleri.
- **🗺️ Harita ve Navigasyon:** MapLibre haritası üzerinde dinamik pinler; tek tıkla Apple Maps, Google Maps veya Yandex Navigasyon ile yol tarifi.
- **⏰ Akıllı Nöbet Pencereleri:** Kapanmaya yakın eczaneleri turuncu rozetle, nöbeti bitenleri soluk durumla belirtir.
- **🤖 MCP (Model Context Protocol) Desteği:** Claude Desktop, Cursor ve AI ajanları için entegre nöbetçi eczane tool'ları (`npm run mcp`).
- **📱 PWA & Mobil Uyumlu:** Telefona uygulama olarak yüklenebilir, offline önbellek desteği sunar.

---

## 🏗️ Mimari ve Altyapı (ADR-008)

Proje, bağımsız, hafif ve yüksek performanslı bir **Node.js + SQLite + Cloudflare Tunnel** mimarisi üzerinde koşmaktadır:

1. **Uygulama Sunucusu (Hono / Node.js):**
   - `@hono/node-server` ile yerel port 3000'de dinler (`src/node/server.ts`).
   - Hem REST API uçlarını (`/api/*`) hem de derlenmiş React SPA arayüzünü (`dist/client`) tek bir süreçten servis eder.
2. **Veritabanı (Gömülü SQLite):**
   - Kalıcı SQLite veritabanı (`data/nobetci.sqlite`) kullanılır.
   - `src/node/sqlite-adapter.ts` ile Cloudflare D1 uyumlu adaptör üzerinden sıfır gecikmeyle çalışır.
   - Otomatik migration motoru ile `migrations/*.sql` şemaları başlangıçta işletilir.
3. **Otomasyon & Veri Çekimi (Dahili Scheduler):**
   - `server.ts` içinde çalışan dahili zamanlayıcı, her saat başından sonra (kaynak rotasyonu 09:00 TRT dikkate alınarak) `eczaneler.gen.tr` üzerinden 81 ilin nöbetçilerini otomatik günceller (`AUTO_SCRAPE_HOURLY=true`).
4. **Güvenli Ağ ve Yayın (Cloudflare Tunnel):**
   - Sunucu internete doğrudan port açmak yerine **Cloudflare Tunnel (`cloudflared`)** üzerinden bağlanır.
   - SSL sertifikasyonu, DDoS koruması ve CDN önbelleklemesi Cloudflare kenar ağı tarafından karşılanır.
   - Alan Adı: **`https://nobetci-eczane.becayisler.com/`**

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Node.js >= 22.18.0
- npm

### Kurulum

```bash
git clone https://github.com/gokhangunesyou-cmd/eczaneapp.git
cd eczaneapp
npm install
```

### Geliştirme Ortamı

```bash
# Vite geliştirme sunucusunu başlatır (Hot Reload)
npm run dev
```

### Prodüksiyon Sunucusu

```bash
# 1. İstemci kodlarını derle
npm run build

# 2. Node.js sunucusunu başlat (Port: 3000)
npm start
```

### Docker / Coolify ile Çalıştırma

Projede çok aşamalı optimize bir `Dockerfile` bulunmaktadır:

```bash
docker build -t nobetci-eczane .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data nobetci-eczane
```

---

## 🛠️ Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Yerel Vite geliştirme sunucusu |
| `npm start` | Prodüksiyon Node.js sunucusu (Hono + SQLite + Scheduler) |
| `npm run build` | Vite client derlemesi (`dist/client`) |
| `npm run test` | Vitest birim testleri |
| `npm run test:e2e` | Playwright uçtan uca testler |
| `npm run lint` | TypeScript ve ESLint kod stili denetimi |
| `npm run scrape -- tum` | 81 il için güncel nöbetçileri çeker |
| `npm run mcp` | AI ajanları için MCP sunucusunu başlatır |

---

## 📚 Mimari Karar Kayıtları (ADR)

- [ADR-001: Veri Kaynağı Seçimi](docs/adr/001-veri-kaynagi.md)
- [ADR-002: Harita ve Yol Tarifi](docs/adr/002-harita-yol-tarifi.md)
- [ADR-003: Veri Tazeleme Stratejisi](docs/adr/003-veri-tazeleme.md)
- [ADR-004: Panelden Veri Girişi](docs/adr/004-panelden-veri-girisi.md)
- [ADR-005: e-Devlet Scraping](docs/adr/005-edevlet-scraping.md)
- [ADR-006: Türkiye Geneli Kapsam ve Günlük Otomasyon](docs/adr/006-turkiye-geneli-ve-gunluk-otomasyon.md)
- [ADR-007: eczaneler.gen.tr Kaynağı](docs/adr/007-eczaneler-gen-tr-kaynagi.md)
- [ADR-008: Node.js, SQLite ve Cloudflare Tunnel Mimarisi](docs/adr/008-node-sqlite-ve-cloudflare-tunnel.md)

---

## 📄 Lisans

Bu proje özel mülkiyettir (Private). Tüm hakları saklıdır.
