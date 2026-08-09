# ADR-007 — Veri kaynağı e-Devlet'ten eczaneler.gen.tr'ye taşındı

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-08
- **Değiştirdiği karar:** ADR-005 (kaynak seçimi ve koordinat toplama yöntemi)
- **Dayandığı karar:** ADR-006 (çekim Cloudflare dışında, GitHub Actions'ta koşar)

---

## Bağlam

ADR-005/006 sonrası kurulan akış üretimde **hiç veri üretmedi**. Prod'da yalnızca
elle girilmiş Antalya kayıtları vardı, 80 il boştu.

İki ayrı arıza üst üste binmişti:

1. **Çekim hiç koşmadı.** İş akışı `node-version: "20"` ile kuruluyordu; çekim
   komutu slug üretimini `src/shared/slug.ts`'ten import ediyor ve Node'un
   yerleşik tip sıyırmasına dayanıyor. Node 20'de o yetenek yok — komut
   `ERR_UNKNOWN_FILE_EXTENSION` ile, kaynağa tek istek atmadan düşüyordu. Adım
   `continue-on-error: true` taşıdığı için Actions "yeşil" gösteriyordu: koşu
   19 saniyede bitmiş, kimse fark etmemişti.
2. **Koordinat toplama yapısal olarak yavaştı.** e-Devlet koordinatı listede
   vermiyor; her eczane için oturuma bağlı ayrı bir `?harita=Goster&index=N`
   isteği gerekiyor. ADR-005 kaynağa saygı gereği koşu başına 400 koordinatla
   sınırlamıştı. Ülke genelinde ~1400 eczane var; ilk koşuda haritanın büyük
   kısmı boş kalacak, dolması günler sürecekti.

Birinci arıza tek satırlık bir düzeltme (Node 24). İkincisi kaynağın kendi
yapısından geliyor ve düzeltilemez.

## Karar

**Günlük çekim `https://www.eczaneler.gen.tr/iframe.php?lokasyon=<plaka>`
adresinden yapılır.** `lokasyon` plaka kodudur.

Ölçüldü (8 Ağustos 2026, 81 il):

|                     | e-Devlet                          | eczaneler.gen.tr               |
| ------------------- | --------------------------------- | ------------------------------ |
| Kaynağa istek       | 162 + eczane başına 1 koordinat   | **81**                         |
| Koordinat           | ayrı istek, koşu başına 400 tavan | **listenin içinde**            |
| Koordinat kapsaması | günlere yayılır                   | **%98 (1339/1371)** ilk koşuda |
| Bulunan eczane      | İstanbul 122, Ardahan 0           | **İstanbul 130, Ardahan 4**    |
| Koşu süresi         | ~5–15 dk                          | **~2 dk**                      |

Koordinat, listedeki "yol tarifi" bağlantısının içinde geliyor
(`maps?daddr=37.547871,35.394296`). ADR-005'in koordinat bütçesi, `--max-coords`
ve `--coord-budget` bayrakları bu kaynakta gereksizdir.

`robots.txt` `/iframe.php`'yi kısıtlamıyor (yalnızca `/cgi-bin/`, `/cache/`,
`/parser/`, `/images/`, `/fonts/`). Kaynağa saygı kuralları aynen sürüyor:
sıralı istek, 800 ms aralık, kendini tanıtan User-Agent, 429/5xx görülürse
koşunun tamamı durur.

## Kaynağın iki sınırı ve nasıl karşılandıkları

### 1. Yalnızca bugün

`tarih`, `gun`, `ilce` gibi parametreler yok sayılıyor — denendi, yanıtlar bayt
bayt aynı geliyor. "Yarın" sorgusu yok.

Sonuç: **çekim saatleri değişti.** Eski akış 03:00Z ve 09:00Z'de koşuyordu, yani
nöbetin döndüğü 08:00 TRT'den (05:00Z) **önce**. Bu kaynakta rotasyondan önce
koşmak dünün listesini bugüne yazmak demektir. Yeni saatler:

- `05:15Z` = 08:15 TRT — rotasyondan hemen sonra, günün listesi
- `11:00Z` = 14:00 TRT — gün içi düzeltmeleri yakalayan ikinci koşu

### 2. Nöbet saati yok

Kaynak "kim nöbetçi" diyor, "saat kaçtan kaça" demiyor. Saatler **uydurulmuyor**:
projenin kendi rotasyon modelinden türetiliyor (`src/shared/duty.ts` —
`dutyStartOf`/`dutyEndOf`, her gün 08:00 TRT). Okuma yolundaki `nextRotationAt`,
`minutesUntilClose`, `status` ve edge cache TTL'i zaten aynı modeli kullandığı
için tutarlı kalıyor.

Kaybedilen: e-Devlet bazı illerde gerçek nöbet saatini veriyordu (örn. 08:30
başlayan iller). Artık hepsi 08:00 kabul ediliyor. Yarım saatlik bu sapma,
81 il yerine 1 il veri göstermeye tercih edildi.

Kaynağın başlığındaki tarih (`8 Ağustos Cumartesi`) yine de okunuyor ve bizim
hesapladığımız nöbet gününden farklıysa uyarı basılıyor — kaynağın rotasyon
saati kayarsa bunu sessizce yaşamayalım.

## `source` alanı neden hâlâ `'edevlet'`

`duty_shift.source` ve `pharmacy.coord_source` sütunlarında
`CHECK (... IN ('edevlet','manual'))` var. Bu alanın taşıdığı ayrım **kaynağın
adı değil**, "otomatik çekim mi, elle mi girildi" sorusudur: `manual` olan
koordinata ve nöbete içe aktarma asla dokunmaz.

Yeni bir değer eklemek `duty_shift` ve `pharmacy` tablolarının yeniden
kurulmasını gerektiriyordu. Kazanç yalnızca isimlendirme, bedel prod veritabanında
şema göçü — yapılmadı. `'edevlet'` şimdilik "otomatik" kovasının adıdır.

**Bilinen borç:** değerin adı artık gerçeği anlatmıyor. Şema göçü gerektiren
başka bir iş çıktığında `'otomatik'` olarak yeniden adlandırılmalı.

## Doğal anahtar kaynaktan bağımsızlaştırıldı

Kaynak değiştirmenin sessiz bedeli burada çıktı. İki kaynak aynı eczaneyi farklı
yazıyor:

| e-Devlet      | eczaneler.gen.tr       |
| ------------- | ---------------------- |
| `DİNÇERLER`   | `Dinçerler Eczanesi`   |
| `AHMET DOĞAN` | `Ahmet Doğan Eczanesi` |

Ölçüldü (9 Ağustos 2026, Antalya): prod'daki 36 kaydın **36'sı** yalnızca bu son
ekle ayrışıyor, tam eşleşen **sıfır**. Slug doğal anahtar olduğu için düzeltilmese
ilk koşuda Antalya'nın 36 kaydı öksüz kalacak, 40 yenisi açılacaktı — elle
girilmiş koordinatlar eski kayıtlarda kalacağı için de kaybolacaktı.

`pharmacySlug` artık adın sonundaki `Eczanesi`/`Eczane` ekini anahtara almıyor.
Üç nokta önemli:

- **Görüntülenen ad değişmiyor.** Kaynaktaki hâliyle saklanıyor; kesilen yalnızca
  kimlik.
- **Ek, ham ad üzerinden değil slug üzerinden atılıyor.** `ECZANESİ` sondaki `İ`
  yüzünden `/eczanesi/i` kalıbına takılmıyor — JS `İ` ile `i`'yi denk saymıyor.
  `slugify` bu eşlemeyi zaten doğru yaptığı için ek normalleşmiş metinden
  kesiliyor. Bu tuzağa bir kez düşüldü, test yakaladı.
- **Yalnızca sondaki ek gidiyor.** `Eczane Nish` gibi baştan gelen adlar ve tek
  başına `Eczane` korunuyor.

Mevcut prod slug'ları DEĞİŞMİYOR: e-Devlet'ten gelen adlarda zaten son ek yok, o
yüzden kural onlar için etkisiz. Doğrulandı: 36/36 anahtar eşleşiyor, yani ilk
koşu bu kayıtları mükerrer açmak yerine güncelliyor.

Ekin farklı eczaneleri birbirine çökertme riski 81 ilin tamamında ölçüldü:
1386 eczane, **sıfır çakışma**.

## Sonuçlar

- e-Devlet komutu silinmedi, `npm run scrape:edevlet` olarak duruyor. Resmî
  kaynak ve nöbet saatlerini veren tek kaynak o; yeni kaynak bozulursa geri
  dönülecek yer orası.
- ADR-005'in koordinat bütçesi kuralları yalnızca o komut için geçerli.
- Ayrıştırma `scripts/lib/eczaneler-parse.mjs`'te ayrı duruyor ve kaynaktan
  olduğu gibi alınmış bir HTML örneğine karşı test ediliyor
  (`tests/fixtures/eczaneler-van.html`). Kaynağın yapısı değişirse test kırılır;
  çekim sessizce boş liste yazıp "81 il tamam" demez.
- Üçüncü taraf bir siteye bağımlıyız. Ana sayfası Cloudflare challenge arkasında;
  `/iframe.php` gömülmek için açık olduğundan erişilebiliyor. Bu erişim
  kapanırsa çekim `HTTP 403` ile durur ve koşu kırmızıya döner.
