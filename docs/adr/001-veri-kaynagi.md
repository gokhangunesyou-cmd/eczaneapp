# ADR-001 — Nöbetçi eczane veri kaynağı

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-07
- **Bağlam:** Cloudflare ücretsiz plan · MVP kapsamı Antalya · ürünün tek farklılaştırıcısı kolaylık

---

## Sorun

Nöbetçi eczane verisi Türkiye'de merkezî, ücretsiz ve makine-okunur bir resmî kaynaktan
yayınlanmıyor. Veriyi üreten asıl merci **il eczacı odaları**; her oda kendi nöbet
listesini kendi sitesinde, kendi formatında yayınlıyor. Sağlık Bakanlığı / TİTCK tarafı
e-Devlet kimlik doğrulaması arkasında ve programatik erişime uygun değil.

Uygulamanın kararlı çalışması için gereken: koordinat içeren, günlük güncellenen,
kullanım hakkı net bir kaynak.

---

## Seçenekler

### A) Antalya Eczacı Odası XML servisi

`https://www.antalyaeo.org.tr/nobetcieczaneler.xml?username=…&password=…`

|           |                                                                                  |
| --------- | -------------------------------------------------------------------------------- |
| Kapsam    | Antalya (tüm ilçeler)                                                            |
| Alanlar   | ad, telefon, **enlem/boylam**, açık adres, ilçe, GLN kodu, nöbet başlangıç/bitiş |
| Ücret     | **Ücretsiz**                                                                     |
| Erişim    | Başvuru formu → `info@antalyaeo.org.tr` → kullanıcı adı/parola                   |
| Limit     | **IP + kullanıcı adı başına günde 10 sorgu**; tüm erişimler loglanıyor           |
| Güncellik | Her sabah 08:00'de nöbet rotasyonu; önerilen sorgu penceresi 08:00–09:00         |
| Lisans    | Odanın açık izniyle, başvuru şartlarına bağlı                                    |

**Artı:** Veriyi üreten merciin kendisi — aracı yok, gecikme yok. Koordinat hazır geliyor,
geocoding maliyeti sıfır. Yazılı izin var, yasal durum tartışmasız. GLN kodu kalıcı bir
kimlik veriyor; eczane adı değişse bile kayıt eşleştirmesi bozulmuyor.

**Eksi:** Tek il. 81 ile çıkmak için 81 ayrı başvuru ve muhtemelen 81 farklı format.
Günde 10 sorgu limiti istek-anı çekmeyi tamamen imkânsız kılıyor.

### B) NosyAPI

|            |                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------ |
| Kapsam     | Türkiye + KKTC                                                                             |
| Ücretsiz   | Ayda 500 kredi                                                                             |
| Maliyet    | İl/ilçe listesi 0 kredi · konuma göre nöbetçi 1 kredi · **ülke geneli tek çekim 81 kredi** |
| Güncelleme | Günde 7 kez (09:00, 10:00, 11:00, 13:00, 15:00, 17:00, 19:30)                              |
| Ücretli    | $6/ay → 5.000 kredi · $35/ay → 200.000 kredi                                               |

**Artı:** Tek entegrasyonla 81 il. Fiyatlandırma şeffaf ve ucuz.

**Eksi:** Günlük ülke geneli senkron ayda **2.430 kredi** eder — 500 kredilik ücretsiz
kotanın ~5 katı. Ücretsiz planda ayda yalnızca ~6 tam senkron yapılabilir; günlük değişen
bir veri için işe yaramaz. **Ücretli kota gerektirmeme kısıtını ihlal ediyor.**

### C) EczaneAPI

81 il / 973 ilçe, koordinat dahil, "geliştiriciler için ücretsiz" iddiası var ancak
fiyatlandırma sayfası plan ve limit detayı yayınlamıyor. %99,9 uptime taahhüdü ve
"resmî kaynaklardan + sahadan" veri iddiası mevcut. Şirket: Loryana LLC.

**Eksi:** Limitleri doğrulanamadı. Üzerine bağımlılık kurulamaz; ama adaptör olarak
tutulmaya değer.

### D) Eczaneler.ORG

TR + KKTC (82 il), ~29.000 eczane, koordinat ve çalışma saatleri dahil, `X-Api-Key`
başlığıyla, IP whitelist, pratikte rate-limit yok.

**Eksi:** **Ücretsiz plan yok.** ₺1.000/yıl (tüm ülke) veya ₺500/yıl (tek il).
3 günlük deneme var. Kısıt gereği eleniyor.

### E) CollectAPI

Freemium, il/ilçe bazlı sorgu, adres-telefon-konum döndürüyor. Ücretsiz plan limitleri
belgelenmiş değil.

**Eksi:** Şeffaflık yok. Elendi.

### F) İl eczacı odalarının sitelerini scrape etmek

**Artı:** Ücretsiz, 81 ile teorik olarak açık.

**Eksi:** 81 ayrı HTML yapısı ve 81 ayrı bakım yükü. Koordinat çoğu sitede yok →
geocoding gerekir → o da kota demek. Site yenilendiğinde sessizce bozulur.

**Yasal / etik durum:** Nöbet listesi kamuya açık ve kamu yararına yayınlanan olgusal
bir veri; eczane adı, adresi ve telefonu ticari işletme bilgisidir (eczacının şahsi
verisi değil). Buna karşılık:

- Her sitenin `robots.txt` ve kullanım şartları ayrı ayrı bağlayıcıdır,
- İzin verilse bile agresif çekim (sık istek, paralel bağlantı) etik değildir,
- İzin olmadan çekilen veriyle **sağlık acili** senaryosunda hizmet vermek, veri yanlış
  olduğunda sorumluluğu tamamen bize yükler.

**Karar: MVP'de scraping yapılmayacak.** Bir il için oda API'si alınamadıysa ve scraping
zorunlu hale gelirse asgari şartlar: `robots.txt`'e uyum · günde en fazla 2 istek ·
kimliğini açıkça belirten `User-Agent` ve iletişim adresi · odaya önceden bilgilendirme
e-postası · arayüzde kaynak atfı.

---

## Karar

**Antalya Eczacı Odası XML servisi birincil kaynak (Seçenek A). Tüm erişim bir adaptör
katmanının arkasından yapılacak.**

### Gerekçe

1. **Kısıtla uyumlu tek resmî kaynak.** Gerçekten ücretsiz, gerçekten izinli, koordinatlı.
2. **Tasarım zaten Antalya.** Onaylı mockup'taki her ilçe (Muratpaşa, Kepez, Konyaaltı,
   Aksu, Döşemealtı, Serik, Manavgat) Antalya'ya ait. Ürün tek il için tasarlanmış.
3. **Aracısız.** Veriyi üreten merciin kendisinden alıyoruz; üçüncü taraf API'lerin
   gecikmesi, yorumu ve iş sürekliliği riski yok.
4. **Günde 10 sorgu limiti bir kısıt değil, bir tasarım girdisi.** İstek-anı çekmeyi
   eleyip bizi doğru mimariye (cron → D1) zorluyor. Bkz. ADR-003.
5. **Doğru büyüme yolu il ile.** Her yeni il = bir oda başvurusu + bir adaptör. 81 ilin
   %100'ünü gün 1'de yanlış veriyle kapsamaktansa, bir ili doğru kapsamak.

---

## Adaptör katmanı

Uygulamanın hiçbir yeri ham kaynak formatını görmez.

```
                         ┌──────────────────────────┐
   cron (günde 2 kez) ──▶│  PharmacySource (port)   │
                         │  fetchDutyRoster(date)   │
                         │    → NormalizedPharmacy[]│
                         └────────────┬─────────────┘
                                      │
        ┌──────────────┬──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
  AntalyaEO      NosyApi       EczaneApi       Fixture        (yeni oda)
  XML→normalize  JSON→norm.    JSON→norm.      test/dev
     MVP          il eklerken     yedek         ağ yok
```

### Normalize edilmiş kayıt

```ts
type NormalizedPharmacy = {
  sourceKey: string; // "antalya-eo" — hangi adaptörden geldi
  sourceId: string; // kaynaktaki kalıcı kimlik (Antalya'da GLN)
  name: string;
  phone: string | null; // E.164'e normalize
  address: string;
  cityCode: number; // plaka kodu — 07
  districtCode: string; // TÜİK ilçe kodu
  districtName: string;
  lat: number;
  lng: number;
  dutyStart: string; // ISO 8601, UTC
  dutyEnd: string; // ISO 8601, UTC
};
```

### Sözleşme kuralları

- Adaptör **ağ hatasını yutmaz**, tipli hata fırlatır: `SourceUnavailable`,
  `SourceAuthFailed`, `SourceRateLimited`, `SourceMalformed`.
- Adaptör **kısmi başarı döndürmez.** Kayıtların bir kısmı bozuksa bozuk olanları atar,
  atılanların sayısını `sync_log`'a yazar; hepsi bozuksa `SourceMalformed` fırlatır.
- Koordinatı olmayan kayıt **kabul edilmez** — haritada gösterilemeyecek bir eczane
  kullanıcıyı yanıltır.
- Adaptör D1'i tanımaz, `Response` üretmez, log yazmaz. Saf dönüşüm.
- Hangi adaptörün çalışacağı `PHARMACY_SOURCE` env değişkeniyle seçilir.
  Varsayılan dev değeri: `fixture` (ağ yok, deterministik test).

---

## Sonuçlar

**İyi**

- Kaynak değişirse tek dosya değişir; D1 şeması ve `contracts/openapi.yaml` sabit kalır.
- Testler `FixtureAdapter` ile ağa çıkmadan koşar; oda API'si erişimi gelmeden S1–S8
  arası tüm dilimler geliştirilebilir.
- Yasal risk yok.

**Kötü**

- MVP tek il. Diğer illerin kullanıcıları "bu ilde henüz yokuz" ekranı görecek.
- Antalya Eczacı Odası erişimi iptal ederse tek kaynağımız kesilir. Azaltma: veri
  D1'de kalıcı, `stale` bayrağıyla servis edilmeye devam eder; ikinci adaptöre geçiş
  bir env değişikliği.
- Her yeni il manuel başvuru gerektiriyor; otomatik ölçeklenmiyor.

**Takip**

- Antalya erişimi geldiğinde `AntalyaEOAdapter` gerçek XML'e karşı doğrulanacak;
  o güne kadar fixture kaynak dokümandaki alan listesinden üretiliyor.
- İkinci il için önce ilgili odaya başvurulur; oda API vermiyorsa NosyApiAdapter
  (ücretli, karar kullanıcıya bırakılır) devreye alınır.
