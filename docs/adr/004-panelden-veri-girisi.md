# ADR-004 — Veri girişi panele taşındı

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-08
- **Değiştirdiği karar:** ADR-001 (kısmen), ADR-003 (tamamen)

---

## Bağlam

ADR-001 birincil veri kaynağı olarak Antalya Eczacı Odası XML servisini seçmişti.
Servis erişimi başvuru gerektiriyor ve başvuru sonucu beklenirken ürünün ilerlemesi
duruyor. Proje sahibi veri girişinin **admin panelinden manuel** yapılmasına, otomatik
besleme yolunun sonra çözülmesine karar verdi.

## Karar

**D1 artık sistemin kayıt otoritesi (system of record).** Nöbetçi eczane verisi admin
panelinden girilir; dış kaynaktan çekilmez.

Somut sonuçlar:

1. **Cron trigger'lar kaldırıldı.** `wrangler.jsonc` içinde `triggers.crons` yok.
   Çekilecek bir kaynak olmadığı için zamanlanmış iş de yok.
2. **`/api/admin/sync` uçları kaldırıldı**, yerine CRUD geldi:
   `/api/admin/pharmacies` ve `/api/admin/duties`.
3. **Adaptör katmanı korundu** ama pasif. `PharmacySource` portu ve `FixtureAdapter`
   duruyor; otomatik besleme geldiğinde içe aktarma yolu olarak kullanılacak.
   ADR-001'in adaptör tasarımı geçerliliğini koruyor.
4. **Okuma yolu değişmedi.** Genel API hâlâ D1'den okuyor ve Cache API katmanının
   arkasında. ADR-003'ün _okuma_ tarafı aynen geçerli; _yazma_ tarafı (cron → D1)
   yerini panele bıraktı.

## Gerekçe

- Dış kaynağa bağımlılık ortadan kalktı; ürün bugün çalışır hale geliyor.
- Kaynağın günde 10 istek limiti artık bir kısıt değil.
- Manuel giriş küçük ölçekte (bir il, günde ~15 nöbetçi eczane) sürdürülebilir.
- Otomatik besleme geldiğinde panel **düzeltme arayüzü** olarak değerini koruyacak —
  kaynak verisi hatalıysa elle düzeltilebilecek.

## Sonuçlar

**İyi**

- Ücretsiz plan kotalarında daha da rahatız: dış `fetch` yok, cron yok, subrequest yok.
- Veri kalitesi doğrudan kontrol altında.
- Test etmesi kolay; ağa çıkan hiçbir yol kalmadı.

**Kötü**

- **Veriyi güncel tutmak insan işi.** Nöbet her gün 08:00'de dönüyor; giriş yapılmazsa
  uygulama bayat veri gösterir. Azaltma: `stale` bayrağı ve tasarımdaki çevrimdışı
  bandı zaten bu durumu karşılıyor; panelde ayrıca "bugün için nöbet girilmemiş"
  uyarısı var.
- Ölçeklenmiyor. İkinci il eklendiğinde manuel giriş sürdürülemez hale gelir —
  o noktada ADR-001'in adaptör yolu devreye alınmalı.

**Takip**

- Otomatik besleme geldiğinde bu ADR "Yerini aldı: ADR-00X" ile işaretlenecek.
- Panelde toplu içe aktarma (CSV/yapıştır) bir sonraki kolaylık adımı olarak duruyor.
