# ADR-006 — Türkiye geneli kapsam ve günlük otomatik çekim

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-08
- **Değiştirdiği karar:** ADR-004 (kısmen — "cron yok, dış fetch yok" maddesi)
- **Dayandığı karar:** ADR-005 (e-Devlet kaynağı ve kaynağa saygı sınırları)

---

## Bağlam

ADR-005 ile e-Devlet'ten çekim çalışır hale geldi ama iki eksik kaldı:

1. **Kapsam tek il.** Kaynak 81 ilin hepsini aynı formla veriyor; Antalya'da
   kalmak teknik bir zorunluluk değil, sadece ilk adımdı.
2. **Çekim insan işi.** Komut elle çalıştırılıyor. Ölçüldü: yerel veritabanında
   37 kayıt varken production'da 12 kayıt vardı, çünkü komut prod'a karşı bir kez
   eksik koştu ve bir daha koşmadı. Nöbet her gün 08:00'de dönüyor; elle
   çalıştırmaya bağlı bir veri akışı bayat veri üretir.

Aynı anda ADR-004'ün "veri panelden girilir, cron yok" kararı artık gerçeği
anlatmıyor: ADR-005 ile dış kaynak zaten geri geldi.

## Karar

**Çekim her gün otomatik koşar ve 81 ili kapsar. Çekim Cloudflare'in dışında,
GitHub Actions'ta koşar.**

### Neden Worker içinde değil

Ücretsiz Workers planında invocation başına **10 ms CPU** ve **50 dış
subrequest** var. Tek bir ilin sonuç sayfasını regex ile ayrıştırmak bile bu CPU
bütçesini zorlar; 81 il × 2 gün × (form + sorgu + koordinat) istek sayısı da
subrequest tavanının çok üstünde. Cron trigger'ın 15 dakikalık süre tavanı
sorunu çözmez, çünkü sınır **CPU** ve **subrequest**, süre değil.

Ücretli plana ($5/ay) geçmek bu sınırları kaldırırdı; ürünün bugünkü ölçeğinde
buna gerek görülmedi. Karar gerekirse geri döner: çekim mantığı tek dosyada
(`scripts/scrape-edevlet.mjs`) ve yazma yolu HTTP üzerinden, ikisi de taşınabilir.

### Somut sonuçlar

1. **`.github/workflows/scrape.yml`** günde iki kez koşar: 06:00 ve 12:00 TRT.
   Birincisi nöbet dönmeden bugünü tazeler, ikincisi kaynak yarının listesini
   yayınladıktan sonra onu alır.
2. **Panelden tetikleme** `POST /api/admin/scrape/trigger` ile yapılır. Worker'ın
   tek yaptığı GitHub'a bir `repository_dispatch` POST'u — bir subrequest, HTML
   ayrıştırma yok. Kaynağa saygı gereği **10 dakikada bir** tetiklenebilir; sayaç
   ayrı bir tabloda değil, mevcut `audit_log` üzerinde tutulur.
3. **Koşu defteri** `scrape_run` tablosunda. Her il-gün için bir satır:
   kaç satır bulundu, kaç nöbet yazıldı, kaç koordinat çekildi, sonuç ne oldu.
   Sessiz bozulma buradan görülür — bir ilde `rowsFound` birden düşerse ya da
   `error` birikirse kaynak sayfası değişmiş demektir.
4. **Koordinat bütçesi.** Koşu başına toplam koordinat isteği sınırlı
   (varsayılan 400), il-gün başına da ayrı tavan var (40). Türkiye genelinde ilk
   koordinat doldurması binlerce istek eder; bu bütçe onu **günlere yayar**.
   Bilinen koordinat tekrar istenmez (ADR-005), yani yük zamanla sıfıra iner.
5. **Hata izolasyonu.** Bir il bozulursa koşu durmaz, o il-gün `error` olarak
   kaydedilir ve diğerleri çekilir. Yalnızca kaynak 429/5xx döndüğünde **tüm koşu
   durur** — ADR-005'in geri çekilme kuralı.

### Tekrar çalıştırmanın güvenliği

Günlük iş akışı bugünü ve yarını **her koşuda** yeniden çekiyor. Dün "yarın"
olarak yazılan kayıt bugün tekrar geldiğinde ikinci bir nöbet satırı açmaz:

- `duty_shift` üzerinde `UNIQUE (duty_date, pharmacy_id)` var,
- içe aktarma o il-günün önceki `source='edevlet'` nöbetlerini silip yeniden
  yazar; `source='manual'` olanlara dokunmaz,
- eczane kimliği slug'dır, aynı slug ikinci kayıt açmaz.

Bu davranış `src/worker/routes/import.test.ts` içinde teste bağlıdır.

## Gerekçe

- **Ücretsiz.** Actions'ın ücretsiz kotası (private depo için 2000 dk/ay) günlük
  ~10 dakikalık koşuyu rahat karşılıyor. Worker kotasına hiç dokunulmuyor.
- **Doğru yerde koşuyor.** Ayrıştırma CPU ister; Workers ucuz CPU için tasarlanmış
  bir yer değil. İstek yolu (okuma) Cloudflare'de kalıyor, toplu iş dışarıda.
- **Panel düğmesi ile zamanlanmış koşu aynı yolu kullanıyor.** İki ayrı kod yolu
  yok; elle tetiklenen koşu ile otomatik koşu birebir aynı şeyi yapar.

## Sonuçlar

**İyi**

- Veri 81 ilde ve her gün taze; insan müdahalesi gerekmiyor.
- Koşu defteri sayesinde "veri neden eski" sorusunun cevabı panelde.
- Kaynağa yük sabit ve öngörülebilir: steady state ~324 istek/koşu.

**Kötü**

- **Yeni bir dış bağımlılık: GitHub.** Actions kesintide veri tazelenmez.
  Azaltma: `stale` bayrağı zaten var, panel elle giriş yolu açık, komut herhangi
  bir makinede elle koşturulabilir.
- **Panel parolası GitHub secret'ında.** Çekim panele giriş yaparak yazıyor.
  Azaltma: token yerine ayrı bir çekim kullanıcısı açmak ileride mümkün.
- Tetikleme düğmesi **eşzamanlı değil**: sonuç birkaç dakika sonra koşu
  defterinde görünür. Panel bunu açıkça söyler.

**Takip**

- **MapTiler kotası** (100k harita yüklemesi/ay) artık izlenmesi gereken kalem:
  kapsam 81 il olunca trafik buna göre büyür. Harita hâlâ ayrı chunk ve yalnızca
  sonuç ekranında yükleniyor (ADR-002), ama kota tavanı yaklaşırsa ilk önlem
  haritayı kullanıcı isteğine bağlamak olur.
- Kaynak bazı iller için hiç satır döndürmüyor (ölçüldü: Ankara, Kayseri,
  Diyarbakır, Isparta — 81 il × 2 günün 91'i boş). Bunun kaynakta mı yoksa
  sorgumuzda mı olduğu araştırılmalı; koşu defteri bu soruyu cevaplayacak veriyi
  zaten topluyor.

## Genel arayüzün il çözümü

Kapsam 81 ile açılınca "kullanıcı hangi ilde" sorusu ortaya çıktı. Reverse
geocoding KULLANILMIYOR — MapTiler'ın ücretsiz kotası haritaya ayrıldı. Bunun
yerine kendi verimiz sorgulanıyor (`src/worker/repo/cities.ts`):

1. Kullanıcının etrafındaki ±0.6° kutuda **en yakın eczanenin ili**. İl sınırında
   bile doğru: "hangi ile yakınım" değil "hangi ilin eczanesine yakınım" sorusu
   cevaplanıyor. Kutu taraması `idx_pharmacy_coords` üzerinden gidiyor.
2. Kutu boşsa **merkezi en yakın il** (migration 0004). Liste boş döner ama
   kullanıcı doğru il adını görür — "Konya'da bugün veri yok" demek, sessizce
   başka bir ilin listesini göstermekten iyidir.

Elle seçim her ikisini de ezer ve `localStorage`'da saklanır.

`stale` bayrağı da il bazlı hesaplanıyor: Antalya'nın verisi tazeyken Konya'daki
kullanıcı `stale: false` görmemeli.
