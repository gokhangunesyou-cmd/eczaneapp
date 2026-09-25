# ADR-003 — Veri tazeleme stratejisi

- **Durum:** Aşılmış / Güncellendi (Bkz. ADR-008: Node.js, SQLite ve Cloudflare Tunnel mimarisine geçildi)
- **Tarih:** 2026-08-07 (Güncellendi: 2026-09-25)
- **Bağlam:** İlk aşamada Cloudflare Workers + D1; ADR-008 ile Node.js + SQLite + Cloudflare Tunnel yapısına geçildi.

---

## Sorun

Nöbet listesi her sabah 08:00'de tamamen değişiyor. Veri iki şekilde taze tutulabilir:

- **(A) İstek anında çek + cache'le** — kullanıcı istek attığında kaynağa git, sonucu
  bir süre sakla
- **(B) Zamanlanmış çek + sakla** — cron ile günde birkaç kez kaynaktan çek, veritabanına
  yaz, istekleri veritabanından karşıla

Hangisinin seçileceğini ücretsiz plan kotaları ve kaynağın kendi limiti belirliyor.

---

## Belirleyici kısıt

**Antalya Eczacı Odası API'si: IP + kullanıcı adı başına günde 10 sorgu.**

Bu tek başına **Seçenek A'yı imkânsız kılıyor**. Cache ne kadar uzun olursa olsun,
Cloudflare'ın edge'i dünyaya yayılmış çok sayıda kolokasyondan oluşur ve her biri
kendi cache'ini tutar; ilk isabetsizlikler kaynağa gider. Onuncu istekten sonra
uygulama veri alamaz duruma düşer. Ayrıca oda tüm erişimleri IP ve kullanıcı adıyla
logluyor — limiti zorlamak erişimin iptaliyle sonuçlanır.

Karar bu noktada verilmiş oluyor. Geriye **B'nin nasıl kurulacağı** kalıyor.

---

## Depolama seçeneği: D1 mi, KV mi?

### Workers KV

|                           | Ücretsiz limit                |
| ------------------------- | ----------------------------- |
| Okuma                     | 100.000 / gün                 |
| **Farklı anahtara yazma** | **1.000 / gün**               |
| Aynı anahtara yazma       | 1 / saniye                    |
| Depolama                  | 1 GB                          |
| Tutarlılık                | Nihai — global yayılım ~60 sn |
| Minimum cache TTL         | 30 sn                         |

Günde 1.000 yazma bizim senaryomuzda **teorik olarak yeterli**: Antalya'da ~20 ilçe var,
günde 2 senkron × 20 ilçe anahtarı = 40 yazma. Kotanın %4'ü.

Ama KV bu iş için **yanlış araç**:

- **Sorgulanamaz.** "Şu koordinata en yakın 10 nöbetçi eczane" sorgusu KV'de
  yapılamaz — anahtar-değer deposu. Tüm ilçeleri okuyup Worker'da birleştirmek
  gerekirdi; bu hem 10 ms CPU limitini zorlar hem de okuma kotasını çarpar.
- **Nihai tutarlı.** Sabah 08:00 rotasyonunda bazı kullanıcılar dün gecenin listesini
  bir dakika daha görür. Sağlık uygulamasında kabul edilebilir değil.
- **Geçmiş tutmuyor.** "Dün kim nöbetçiydi", "senkron ne zaman başarısız oldu" gibi
  admin panelinin ihtiyaç duyduğu sorular cevapsız kalır.

### Cloudflare D1

|                        | Ücretsiz limit                          |
| ---------------------- | --------------------------------------- |
| Veritabanı             | 10 adet/hesap · 500 MB/db · 5 GB toplam |
| **Satır okuma**        | **5.000.000 / gün**                     |
| **Satır yazma**        | **100.000 / gün**                       |
| Sorgu / Worker çağrısı | 50                                      |
| Time Travel            | 7 gün                                   |

SQL, indeks, join, geçmiş — hepsi var. Bizim yazma hacmimiz (günde ~150 eczane × 2 senkron
= ~300 satır) kotanın **%0,3'ü**.

**Dikkat edilecek kalem: satır okuma.** Ölçekte ilk patlayacak kotamız bu. Günde
100.000 istek × istek başına ~30 satır = 3.000.000 satır/gün → limitin %60'ı. Bu yüzden
D1'in önüne **Cache API** katmanı zorunlu, opsiyonel değil.

---

## Karar

**Cron Trigger → D1 (write-through). Okuma: D1 + Cache API. KV kullanılmıyor.**

```
05:05 UTC (08:05 TRT)   cron ──▶ adapter.fetchDutyRoster()
                                   ├─ başarılı → D1 upsert + sync_log(ok)
                                   └─ hata     → sync_log(fail), eski veri D1'de kalır
                                                 (10 istekten 1'i kullanıldı)

05:35 UTC (08:35 TRT)   cron ──▶ doğrulama: bugün için kayıt var mı?
                                   ├─ var  → hiçbir şey yapma, kaynağa gitme
                                   └─ yok  → tekrar dene
                                                 (10 istekten en fazla 2'si kullanıldı)

GET /api/pharmacies/on-duty
   └─▶ Cache API (isabet) ──▶ dön
   └─▶ Cache API (ıska)  ──▶ D1 SELECT ──▶ haversine sırala ──▶ cache'e yaz ──▶ dön
```

### Zamanlama gerekçesi

- Nöbet **08:00'de** dönüyor; kaynak **08:00–09:00** penceresini öneriyor. `08:05` bu
  pencerenin başında, rotasyonun oturmasına 5 dakika bırakıyor.
- İkinci cron bir **retry**, ikinci bir çekim değil. Önce D1'e bakar; bugünün verisi
  varsa kaynağa hiç gitmez. Böylece normal günde kaynağa **günde 1 istek** gidiyor.
- Cloudflare cron ifadeleri **UTC**. Türkiye kalıcı olarak UTC+3, yaz saati uygulaması
  yok → sabit `5 5 * * *` ve `35 5 * * *` doğru. (Bu varsayım koda yorum olarak düşülecek.)
- Ücretsiz planda hesap başına **5 cron trigger** var; 2'sini kullanıyoruz.

### Cache API stratejisi

- Anahtar: normalize edilmiş URL (koordinatlar ~500 m ızgaraya yuvarlanır → cache
  isabet oranı yükselir, mesafe hassasiyeti kullanıcı için anlamsız derecede az düşer).
- TTL: **bir sonraki rotasyona kalan saniye**, tavanı 15 dakika. Böylece 08:00'de
  bayat veri servis edilmez.
- `sync_log`'da bugünün senkronu başarısızsa TTL 60 saniyeye düşürülür — düzeltme
  hızlı yayılsın.

### Bayat veri davranışı

Cron başarısız olursa D1'deki dünkü veri **silinmiyor**. API yanıtı taşıyor:

```json
{ "stale": true, "dataAsOf": "2026-08-06T05:05:00Z", "items": [ ... ] }
```

Arayüz bunu gördüğünde tasarımdaki **07 Çevrimdışı** ekranını gösterir
("03:02'de kaydettiğim listeyi gösteriyorum. Yola çıkmadan telefonla teyit et.") ve
birincil aksiyonu **"Ara"** yapar — bayat veriyle navigasyona göndermek yanlış olur.
Tasarım bu senaryoyu zaten çözmüş.

---

## Ücretsiz plan bütçesi

Varsayım: günde ~1.000 kullanıcı, kullanıcı başına ~2 API çağrısı.

| Kaynak              | Ücretsiz limit           | Tahmini kullanım     | Pay                    |
| ------------------- | ------------------------ | -------------------- | ---------------------- |
| Workers istek       | 100.000 / gün            | ~2.000               | %2                     |
| **Workers CPU**     | **10 ms / istek**        | ~3 ms                | **%30 — en dar boğaz** |
| Static asset isteği | **ücretsiz ve sınırsız** | —                    | —                      |
| Cron trigger        | 5 adet / hesap           | 2                    | %40                    |
| Subrequest          | 50 / invocation          | 1 (yalnızca cron'da) | %2                     |
| D1 veritabanı       | 500 MB/db · 5 GB toplam  | < 5 MB               | %0,1                   |
| **D1 satır okuma**  | **5.000.000 / gün**      | ~60.000              | %1,2                   |
| D1 satır yazma      | 100.000 / gün            | ~300                 | %0,3                   |
| KV yazma            | 1.000 / gün              | **0**                | —                      |
| MapTiler yükleme    | 100.000 / ay             | ~30.000              | %30                    |
| **Antalya EO API**  | **10 istek / gün / IP**  | **1–2**              | **%20**                |

### İki uyarı

**Workers CPU 10 ms.** Ağır iş — XML parse, normalize, upsert — yalnızca cron
handler'ında. İstek yolunda tek D1 sorgusu + ~150 satır üzerinde haversine hesabı var
(~2–3 ms). Bu yüzden istek yolunda asla kaynağa gidilmez, asla toplu dönüşüm yapılmaz.

**D1 satır okuma ölçekte ilk patlar.** Cache API katmanı bu kotayı tutan şey. Kaldırılırsa
100.000 istek/gün senaryosunda limit aşılır ve D1 sorguları durur.

---

## Sonuçlar

**İyi**

- Kaynağın 10 istek/gün limitine %20 doluluk ile uyuluyor; erişim iptali riski yok.
- Yanıt gecikmesi kaynağın hızından bağımsız — D1 + edge cache, ~10–20 ms.
- Kaynak çökse bile uygulama çalışmaya devam ediyor (bayat ama işlevsel).
- Geçmiş veri D1'de; admin paneli senkron geçmişini gösterebiliyor.
- KV kullanılmadığı için KV'nin 1.000 yazma/gün limiti hiç devreye girmiyor.

**Kötü**

- Gün içinde nöbet listesi değişirse (nadir; eczane kapanması, oda düzeltmesi) en fazla
  ertesi sabaha kadar yansımaz. Azaltma: admin panelinde **elle senkron tetikleme**
  butonu — günlük 10 istekten kalan 8'i bunun için ayrıldı.
- Cron ile veri arasındaki ilişki dolaylı; senkron sessizce bozulursa fark edilmesi
  gecikebilir. Azaltma: `sync_log` tablosu + `/api/health` içinde `lastSyncAt` alanı +
  admin panelinde görünür durum.
- Cron handler'ının 10 ms CPU limiti il sayısı arttıkça riske girer. Azaltma: il başına
  ayrı cron ya da tek cron içinde `waitUntil` ile parçalı işleme; 5 cron limiti
  nedeniyle ikinci yaklaşım tercih edilecek.

**Takip**

- İkinci il eklendiğinde cron CPU süresi ölçülecek; 6 ms'i geçerse parçalı işlemeye
  geçilecek.
- Trafik günde 30.000 isteği geçerse D1 satır okuma metriği izlenmeye başlanacak.
