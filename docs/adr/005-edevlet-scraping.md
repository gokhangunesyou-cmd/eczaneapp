# ADR-005 — Veri kaynağı: e-Devlet TİTCK sorgulama sayfası

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-08
- **Değiştirdiği karar:** ADR-001 (kaynak seçimi), ADR-004 (panel artık tek giriş yolu değil)

---

## ADR-001'deki hatanın düzeltilmesi

ADR-001, e-Devlet/TİTCK kaynağını **"Kimlik doğrulama arkasında, ToS uygun değil"**
gerekçesiyle elemişti. **Bu tespit yanlıştı.** Sayfa tarayıcıda doğrulandı:

- `https://www.turkiye.gov.tr/saglik-titck-nobetci-eczane-sorgulama`
- **Giriş yapılmadan** çalışıyor; "Giriş Yap" düğmesi sayfada var ama hizmet için gerekmiyor.
- `robots.txt` içeriği yalnızca `User-agent: *` — **tek bir `Disallow` satırı yok**,
  `Crawl-delay` yok.

ADR-001'in adaptör tasarımı geçerliliğini koruyor; yanlış olan yalnızca kaynak
değerlendirmesiydi.

## Karar

**Birincil kaynak e-Devlet TİTCK sorgulama sayfasıdır.** Veri bir CLI komutuyla
çekilir, normalize edilir ve kendi admin API'mizin `POST /api/admin/import` ucuna
yazılır. Panel (ADR-004) **düzeltme arayüzü** olarak kalır — kaynak yanlışsa elle
düzeltilir, çekim bu düzeltmeleri ezmez.

## Kaynağın mekaniği (tarayıcıda doğrulandı)

```
1) GET  /saglik-titck-nobetci-eczane-sorgulama
        → oturum çerezi + gizli `token` alanı (CSRF)

2) POST /saglik-titck-nobetci-eczane-sorgulama?submit
        ilkod-address-il   = <plaka>          (1..81; 7 = ANTALYA)
        ilkod-address-ilce = ''               (boş → ilin TAMAMI)
        nobetTarihi        = GG/AA/YYYY       (yalnızca bugün veya yarın)
        token              = <gizli alandan>
        btn                = Sorgula
        → tablo: İlçe · Eczane Adı · Adres · Telefon · Nöbet Başlangıç ·
                 Nöbet Bitiş · Durumu · İşlem
        (Antalya/bugün örneğinde 39 satır)

3) GET  /saglik-titck-nobetci-eczane-sorgulama?harita=Goster&index=<satır sırası>
        → sayfadaki inline Leaflet script'inde enlem ve boylam
        (örnek: 37.0425, 31.7864 — Akseki)
```

### Kritik davranışlar

- **`index` oturuma bağlıdır.** Son POST'un sonuç kümesindeki satır sırasını gösterir.
  Çerez kavanozu tüm koşu boyunca korunmalı, aksi halde yanlış eczanenin koordinatı
  alınır. Bu yüzden istekler **sıralı** yapılır, paralel değil.
- **Nöbet saatleri kaynaktan gelir.** Antalya'da rotasyon `08:30`; sabit `08:00`
  varsayımı yanlıştı. Saat il/ilçeye göre değişebileceği için **hesaplanmaz, okunur**.
- **Koordinat eczane başına bir ek istek demektir.** 39 eczane = 39 ek istek. Bu yüzden
  koordinatı zaten bilinen eczaneler için o istek **yapılmaz** (bkz. aşağıda).
- Tarih seçenekleri yalnızca **bugün ve yarın**. Geçmiş sorgulanamaz — geçmişi biz
  `duty_shift` tablosunda biriktiriyoruz.
- Telefon `0 - (242) 678 - 1300` biçiminde geliyor; E.164'e normalize ediliyor.
- `Durumu` sütunu görülen değer: `Onaylanmış`. Başka değerler çıkabilir; ham olarak
  saklanıyor ve `Onaylanmış` dışındakiler panelde işaretleniyor.

## Kimlik: slug doğal anahtar

Kaynak eczane için kalıcı bir kimlik vermiyor (GLN yok, id yok). Kimlik
**il + ilçe + eczane adı**'ndan türetilen slug'dır:

```
antalya/akseki/murtici
```

Türkçe harfler çevriliyor (`ç→c ğ→g ı→i İ→i ö→o ş→s ü→u`), noktalama atılıyor,
boşluklar `-` oluyor. Aynı slug tekrar geldiğinde **yeni kayıt açılmaz**, mevcut kayıt
güncellenir. Olmayan il ve ilçeler de aynı anda ekleniyor.

**Zayıflığı:** eczane adı değişirse yeni kayıt açılır ve eski kaydın koordinatı
kaybolur. Kabul edildi — alternatifi adres benzerliğine dayalı eşleştirme ki o daha
kırılgan. Panelden birleştirme yapılabilir.

## Koordinat çekme politikası

```
her eczane için:
  slug biliniyorsa VE lat/lng doluysa  → harita isteği YAPILMAZ
  aksi halde                            → ?harita=Goster&index=N (1 istek)
```

İlk koşu 39 harita isteği yapar; ikinci koşu **sıfıra yakın** yapar. Panelden elle
girilmiş koordinat `coord_source = 'manual'` ile işaretlenir ve çekim **onu asla
ezmez** — kaynağın koordinatı yanlışsa düzeltme kalıcıdır.

## Yasal ve etik durum

**Veri:** hangi eczanenin nöbetçi olduğu — devletin vatandaş için yayınladığı,
kamu yararına **olgusal** bilgi. Eczane adı, adresi ve telefonu ticari işletme
bilgisidir; eczacının şahsi verisi değildir.

**İzin göstergeleri:** giriş gerektirmiyor, `robots.txt` hiçbir yolu kapatmıyor,
sayfa paylaşım düğmesi barındırıyor.

**Buna rağmen uyulacak sınırlar:**

- **Günde en fazla birkaç koşu.** Cron ile dakikada/saatte çekilmez.
- **İstekler sıralı ve aralıklı** (varsayılan 800 ms). Paralel istek yok.
- **Kendini tanıtan `User-Agent`** ve iletişim adresi gönderilir.
- **Koordinat isteği yalnızca bilinmeyen eczaneler için** — gereksiz yük yaratılmaz.
- Kaynak yavaşlarsa veya 429/5xx dönerse **geri çekilinir**, yeniden denenmez.
- Arayüzde kaynak atfı yapılır: "Veri kaynağı: T.C. Sağlık Bakanlığı — TİTCK".
- Uygulamada **"eczaneye gitmeden önce telefonla teyit edin"** uyarısı korunur —
  kaynağın kendisi de bu uyarıyı yapıyor.

**Kalan risk:** e-Devlet kullanım şartları otomatik erişimi açıkça düzenlemiyor.
Kaynak isterse IP engelleyebilir veya sayfa yapısını değiştirebilir. İkisi de
ürünü durdurmaz: veri D1'de kalıcıdır, panel elle giriş yolu olarak açıktır ve
ADR-001'in adaptör katmanı başka bir kaynağa geçişi tek dosyaya indirir.

## Sonuçlar

**İyi**

- 81 il tek entegrasyonla kapsanabiliyor; ücretsiz.
- Koordinat kaynaktan geliyor, geocoding maliyeti yok.
- Nöbet saatleri gerçek (08:30 gibi), varsayım değil.
- Geçmiş bizde birikiyor — kaynak yalnızca bugün/yarın veriyor.

**Kötü**

- HTML yapısına bağımlı; sayfa değişirse ayrıştırıcı bozulur. Azaltma: ayrıştırma
  hataları sessizce yutulmaz, komut hata koduyla çıkar ve kaç satır atlandığını yazar.
- Eczane adı değişimi kimliği koparıyor.
- Çekim elle tetiklenir (ya da makinede zamanlanır); Worker cron'undan çalışmaz —
  ücretsiz planda 50 subrequest sınırı 39 harita isteğini zaten kaldıramazdı.

**Takip**

- İkinci il eklenince koşu süresi ve istek sayısı ölçülecek.
- `Durumu` sütununda `Onaylanmış` dışında bir değer görülürse anlamı araştırılacak.
