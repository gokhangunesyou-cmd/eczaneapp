# ADR-002 — Harita, yol tarifi ve süre tahmini

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-07
- **Bağlam:** Cloudflare ücretsiz plan · kart bilgisi vermeyi gerektiren servis tercih edilmiyor

---

## Sorun

Tasarım üç ayrı harita yeteneği istiyor:

1. **Basemap** — kullanıcının konumu ve nöbetçi eczane pinleri bir zemin haritası üstünde
2. **Yol tarifi** — "Yol Tarifi" butonu kullanıcıyı navigasyona götürecek
3. **Süre tahmini** — kartta "1.2 km · **4 dk araçla**" yazıyor

Bunlar tek bir sağlayıcıdan alınması gereken tek bir problem gibi görünüyor. Değil.
Ayırınca ikisinin maliyeti sıfıra iniyor.

---

## Seçenek A — Google Maps JavaScript API + Directions API

|                   |                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Ücretsiz kota     | **SKU başına** aylık ücretsiz tavan (Dynamic Maps gibi Essentials SKU'ları için 10.000 olay)                                   |
| Önemli değişiklik | 1 Mart 2025'te **aylık $200 ortak kredi kaldırıldı**, yerine SKU başına ayrı tavanlar geldi — tavanlar birbirine devredilmiyor |
| Aşınca            | Faturalandırılır (Essentials SKU'ları 1.000 olay başına ~$2–7)                                                                 |
| Ön koşul          | **Faturalandırma hesabı ve kart bilgisi zorunlu**                                                                              |
| Anahtar           | Kullanıcının kendisi alır                                                                                                      |

**Artı:** Türkiye'de en iyi POI ve adres verisi. Tanıdık görsel dil. Directions API
gerçek trafik verisiyle isabetli ETA veriyor.

**Eksi:**

- **Kart bilgisi zorunlu.** "Ücretli servis, ücretli kota gerektiren tercih yok"
  kısıtıyla doğrudan çelişiyor. Yanlış yapılandırılmış bir anahtar veya bir bot trafiği
  sürpriz faturaya dönüşebilir.
- Karşılığında bize verdiği tek şey **karo** — çünkü navigasyonu (aşağıda) zaten native
  uygulamaya devrediyoruz ve Directions API'ye ihtiyacımız kalmıyor.
- Koyu tema için Cloud Style Editor'da ayrı stil kurmak gerekiyor; tasarımın renk
  paletini birebir tutturmak zor.

## Seçenek B — MapLibre GL JS + OpenStreetMap tabanlı karo + OSRM

|             |                                                  |
| ----------- | ------------------------------------------------ |
| Kütüphane   | MapLibre GL JS — BSD, ücretsiz, anahtarsız       |
| Karo        | Sağlayıcı gerekir (MapLibre kendisi karo sunmaz) |
| Yönlendirme | OSRM demo sunucusu                               |

**Artı:** Kütüphane tarafında hiçbir maliyet ve hiçbir kısıt yok. Vektör karo + tam stil
kontrolü → tasarımın `#0B1015` zemini ve `#1C262F` yolları birebir uygulanabilir.

**Eksi (yönlendirme kısmı):** **OSRM demo sunucusu üretimde kullanılamaz.** Resmî kullanım
politikası makul ve **ticari olmayan** kullanımla sınırlıyor, saniyede 1 isteği aşmayı
yasaklıyor, uptime/gecikme/doğruluk garantisi vermiyor ve sunucunun "geliştirme
aşamasındaki" kodu çalıştırdığını belirtiyor. Bir sağlık uygulamasının navigasyonu
buna dayandırılamaz.

**Eksi (karo kısmı):** OSMF'nin standart raster karo sunucusu da uygulama düzeyi
kullanıma kapalı. Bir karo sağlayıcısı seçmek zorundayız.

---

## Problemi üçe ayırmak

### (1) Yol tarifi → hiçbir yönlendirme motoru kullanmıyoruz

Kullanıcıyı **kendi telefonundaki harita uygulamasına** yönlendiriyoruz:

```
Evrensel:  https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving
iOS:       maps://?daddr={lat},{lng}&dirflg=d          (Apple Maps)
```

Android'de Google Maps native olarak açılır; iOS'ta Google Maps kuruluysa o, değilse
Apple Maps. Anahtar yok, kota yok, ücret yok, sunucu yok.

Bu sadece ucuz değil, **daha iyi**: gece 3'te ilaç arayan biri sesli navigasyonu zaten
alışkın olduğu uygulamada alır; bizim uygulamamızın içinde yarım yamalak bir rota çizgisi
görmez. Ürünün "kolaylık" hedefiyle birebir örtüşüyor.

### (2) "4 dk araçla" → sunucuda hesaplanıyor

Haversine mesafesi × şehir içi ortalama hız katsayısı. Tasarımdaki değerler zaten bu
modele oturuyor (1.2 km → 4 dk ≈ 18 km/s; 6.8 km → 14 dk ≈ 29 km/s). Katsayı mesafeye
göre kademeli: kısa mesafede trafik ve park payı ağır, uzun mesafede ana arter hızı baskın.

Arayüzde **tahmin olduğu belli edilir** ("~4 dk"). Gerçek trafik verisi vaadi verilmez.
Matrix API'ye, OSRM'e, Directions API'ye gerek yok. Hesaplama D1 sorgusundan sonra
Worker içinde, mesafe sıralamasıyla aynı geçişte yapılır — ek CPU maliyeti ihmal edilebilir.

### (3) Basemap → geriye tek gerçek karar bu kalıyor

|               | Google Maps                          | MapLibre + **MapTiler**                                         | MapLibre + Protomaps/R2                              |
| ------------- | ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Ücretsiz kota | 10.000 yükleme/ay (Dynamic Maps SKU) | **100.000 yükleme/ay**                                          | pratikte sınırsız                                    |
| Kart bilgisi  | **Zorunlu**                          | **Gerekmiyor** — ücretsiz plan faturalandırma bilgisi istemiyor | **Gerekiyor** (R2 aktivasyonu ödeme yöntemi istiyor) |
| Kota aşılınca | Faturalandırılır                     | **Harita durur, sürpriz fatura yok**                            | Faturalandırılır                                     |
| Koyu tema     | Cloud Style Editor gerekir           | Hazır koyu stiller + tam JSON kontrolü                          | Tam kontrol                                          |
| Ek kota       | —                                    | 5.000 oturum, 100 MB veri barındırma                            | R2: 10 GB, 1M Class A, 10M Class B / ay              |

---

## Karar

**MapLibre GL JS + MapTiler ücretsiz planı. Yol tarifi native uygulamaya deep link.
Süre tahmini sunucuda hesaplanıyor.**

### Gerekçe

1. **Google elendi çünkü kart bilgisi zorunlu.** Bu tek başına kısıt ihlali. Üstelik
   navigasyonu devrettiğimiz için Google'ın sunacağı fazladan bir değer kalmıyor.
2. **MapTiler ücretsiz planı kart istemiyor ve kota aşılınca durup faturalandırmıyor.**
   Ücretsiz plan hedefiyle uyumlu tek davranış bu: en kötü senaryo "harita gelmedi",
   "beklenmedik fatura" değil.
3. **100.000 yükleme/ay bizim ihtiyacımızın çok üstünde.** Tahmini kullanım ~30.000/ay.
4. **Protomaps + R2 teknik olarak en temiz çözüm ama R2 aktivasyonu ödeme yöntemi
   istiyor.** İleriye dönük çıkış yolu olarak duruyor, MVP'de değil.
5. **MapLibre stil kontrolü tasarıma sadakat için şart.** Tasarımın harita zemini
   (`#0B1015`), yolları (`#1C262F`) ve yeşil alanları (`#101C18`) stil JSON'unda
   birebir karşılanabilir.

### Bağımlılığı yalıtma

Karo sağlayıcısı tek bir env değişkeninin arkasında:

```
VITE_MAP_STYLE_URL   # MapTiler stil URL'i (anahtar dahil)
```

MapTiler'dan Protomaps/R2'ye ya da başka bir sağlayıcıya geçiş bu değişkenin değişmesi
ve stil JSON'unun değişmesidir; harita komponentinin kodu değişmez. MapLibre GL JS
sağlayıcıdan bağımsızdır — asıl kilitlenme riski budur ve alınmıyor.

**Not:** `VITE_` önekli değişkenler istemci paketine gömülür ve gizli değildir. MapTiler
anahtarı bu yüzden **MapTiler panelinden domain kısıtına bağlanacak** (`origin` whitelist).

---

## Google seçilseydi — kurulum adımları

Bu karar ezilirse gerekecek adımlar (referans olarak burada tutuluyor):

1. `console.cloud.google.com` → yeni proje oluştur
2. **Billing** → faturalandırma hesabı oluştur ve projeye bağla (kart zorunlu)
3. **APIs & Services → Library** → yalnızca **Maps JavaScript API**'yi etkinleştir
   _(Directions API'ye gerek yok — yol tarifi native uygulamaya gidiyor)_
4. **Credentials → Create credentials → API key**
5. Anahtarı **hemen kısıtla**:
   - _Application restrictions_ → **HTTP referrers** → `https://senindomainin.com/*`
     ve `http://localhost:*/*`
   - _API restrictions_ → **Restrict key** → yalnızca Maps JavaScript API
6. **Billing → Budgets & alerts** → $1 eşiğinde uyarı kur
7. Anahtar `VITE_GOOGLE_MAPS_KEY` olarak `.dev.vars`'a, prod'da Cloudflare secret'ına

Anahtarı proje sahibi alır; bu depoda hiçbir zaman gerçek anahtar bulunmaz.

---

## Sonuçlar

**İyi**

- Harita tarafında ödeme yöntemi hiç gerekmiyor.
- Yol tarifi ve ETA maliyeti tam olarak sıfır; kota takibi gerektirmiyor.
- Tasarımın koyu teması stil JSON'uyla birebir uygulanabiliyor.
- Navigasyon deneyimi kullanıcının kendi uygulamasında — bizim bakım yükümüz yok.

**Kötü**

- ETA gerçek trafiği yansıtmıyor; yoğun saatte sapabilir. Azaltma: "~" işareti ve
  mesafeyi birincil, süreyi ikincil bilgi olarak sunmak.
- MapTiler'ın POI ve Türkçe etiket kalitesi Google'ın altında. MVP için harita bir
  **konum bağlamı** aracı, keşif aracı değil — kabul edilebilir.
- MapTiler kotası aşılırsa harita boş kalır. Azaltma: harita yüklenemezse tasarımdaki
  gradient doku placeholder olarak kalır ve **liste görünümü çalışmaya devam eder** —
  ürünün çekirdek vaadi haritaya bağlı değil.
- MapLibre GL JS paketi büyük (~220 KB gzip). Azaltma: `React.lazy` ile ayrı chunk;
  ilk ekran (izin) ve liste görünümü haritasız açılır.

**Takip**

- Kullanım MapTiler kotasının %60'ını geçerse Protomaps + R2'ye geçiş değerlendirilecek
  (Antalya extract'i R2 ücretsiz kotasının çok altında kalır).
