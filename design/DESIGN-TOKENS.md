# Tasarım Token'ları

**Tek doğru kaynak:** `design/nobetci-eczane.html` (Claude Design çıktısı, onaylı).
Bu dosya o dosyadan **çıkarılmıştır**. Yeni tasarım kararı üretilmez; bir şey burada
yoksa önce HTML'e bakılır, orada da yoksa sorulur.

Tema: **koyu tema birincil** (gece kullanımı). Açık tema `08 Açık tema` ekranında tanımlı.

---

## 1 · Renk

### Marka / aksiyon

Yeşil iki temada **farklı değerdir** — kontrast için kaydırılmıştır, aynı token'ın
opaklık varyantı değildir.

| Token              | Koyu                   | Açık                   | Kullanım                         |
| ------------------ | ---------------------- | ---------------------- | -------------------------------- |
| `--brand`          | `#14C08A`              | `#0E8F68`              | Birincil buton, aktif pin, marka |
| `--brand-hover`    | `#3EE0AE`              | —                      | Buton hover, link hover          |
| `--brand-muted`    | `#0E8F68`              | —                      | İkincil (uzak) pin — koyu temada |
| `--brand-on`       | `#04120D`              | `#FFFFFF`              | Marka zemin üstündeki metin/ikon |
| `--brand-soft-bg`  | `rgba(20,192,138,.14)` | `rgba(14,143,104,.12)` | "Açık" rozeti zemini             |
| `--brand-soft-fg`  | `#3EE0AE`              | `#0B7455`              | "Açık" rozeti metni              |
| `--brand-ghost-bg` | `rgba(20,192,138,.12)` | —                      | Outline buton hover              |

### Durum

| Token            | Değer                  | Kullanım                                    |
| ---------------- | ---------------------- | ------------------------------------------- |
| `--warn`         | `#FF9A3C`              | Yakında kapanıyor · seçili pin · çevrimdışı |
| `--warn-fg`      | `#FFB265`              | Turuncu zemin üstü açık metin               |
| `--warn-on`      | `#241304`              | Turuncu zemin üstündeki metin/ikon          |
| `--warn-soft-bg` | `rgba(255,154,60,.16)` | Uyarı rozeti zemini                         |
| `--warn-surface` | `#231A11`              | Uyarı kartı zemini                          |
| `--warn-border`  | `#4A3620`              | Uyarı kartı kenarlığı                       |
| `--warn-icon`    | `#C7A277`              | Uyarı kartındaki ikon butonu                |
| `--danger`       | `#E05A5A`              | "Kapalı" · nöbeti bitti                     |

### Kullanıcı konumu (marka renginden ayrı tutulur)

| Token         | Koyu                       | Açık                  |
| ------------- | -------------------------- | --------------------- |
| `--user-dot`  | `#3B82F6`                  | `#2563EB`             |
| `--user-halo` | `rgba(59,130,246,.25–.30)` | `rgba(37,99,235,.22)` |

### Yüzey — koyu tema

| Token               | Değer     | Kullanım                                        |
| ------------------- | --------- | ----------------------------------------------- |
| `--bg`              | `#0B1015` | Harita ekranı zemini                            |
| `--bg-alt`          | `#0F1419` | Haritasız ekran zemini (izin, ilçe, çevrimdışı) |
| `--bg-sheet-behind` | `#0A0E12` | Canvas/en arka                                  |
| `--surface`         | `#171D24` | Bottom sheet                                    |
| `--surface-2`       | `#1C232B` | Birincil eczane kartı                           |
| `--surface-3`       | `#212932` | Rozet/skeleton bloğu                            |
| `--surface-4`       | `#1D242C` | Skeleton ikincil bloğu                          |
| `--border`          | `#232C36` | Ayırıcı çizgi, cihaz kenarlığı                  |
| `--border-2`        | `#26313B` | Kart kenarlığı                                  |
| `--border-3`        | `#2A343E` | Outline buton kenarlığı                         |
| `--border-strong`   | `#39434E` | Sheet tutamağı                                  |
| `--border-hover`    | `#3B4550` | Outline buton hover                             |

### Yüzey — açık tema

| Token         | Değer     |
| ------------- | --------- |
| `--bg`        | `#F3F5F4` |
| `--surface`   | `#FFFFFF` |
| `--surface-2` | `#F7F9F8` |
| `--border`    | `#DDE2E0` |
| `--border-2`  | `#E2E7E5` |
| `--handle`    | `#D2D9D6` |

### Metin

| Token        | Koyu      | Açık      | Kullanım                                 |
| ------------ | --------- | --------- | ---------------------------------------- |
| `--text`     | `#EDF1F5` | `#0F1419` | Başlık, birincil                         |
| `--text-2`   | `#B4C0CC` | `#4B5551` | Kart alt satırı                          |
| `--text-3`   | `#8B98A5` | `#6B7570` | Adres, meta                              |
| `--text-4`   | `#94A1AE` | —         | Açıklama paragrafı                       |
| `--text-dim` | `#66727E` | `#98A3A0` | Bölüm başlığı, placeholder, durum çubuğu |

### Harita zemini (mockup dokusu)

```
radial-gradient(circle at 46% 34%, #131C24, #0B1015 72%),
repeating-linear-gradient(24deg,  transparent 0 46px, #161F27 46px 49px),
repeating-linear-gradient(114deg, transparent 0 62px, #161F27 62px 65px)
```

Gerçek uygulamada MapLibre karo katmanı bunun yerine geçer; **yükleme ve harita hatası
durumlarında** bu doku placeholder olarak kullanılır. Yol çizgisi `#1C262F`, park/yeşil
alan `#101C18`.

---

## 2 · Tipografi

| Aile        | Ağırlıklar            | Nerede                                                  |
| ----------- | --------------------- | ------------------------------------------------------- |
| **Archivo** | 500 · 600 · 700 · 800 | Başlık, buton etiketi, eczane adı, rozet, sayısal vurgu |
| **Inter**   | 400 · 500 · 600       | Gövde, adres, meta, açıklama                            |

> Fontlar **self-host** edilir (`woff2`, static asset). Tasarım HTML'i Google Fonts CDN
> kullanıyor; PWA çevrimdışı hedefiyle çeliştiği için değiştirilmiştir. Görsel çıktı aynı.

### Ölçek

| Token         | Boyut / Ağırlık / Aile   | Letter-spacing | Kullanım                                        |
| ------------- | ------------------------ | -------------- | ----------------------------------------------- |
| `--t-display` | 30px / 800 / Archivo     | `-.03em`       | İzin ekranı başlığı (`line-height:1.15`)        |
| `--t-title`   | 26px / 800 / Archivo     | `-.03em`       | İlçe seçimi başlığı (`line-height:1.2`)         |
| `--t-h1`      | 22px / 800 / Archivo     | `-.025em`      | Eczane adı — birincil kart (`line-height:1.15`) |
| `--t-h2`      | 20px / 800 / Archivo     | `-.025em`      | Eczane adı — half sheet                         |
| `--t-brand`   | 17px / 800 / Archivo     | `-.02em`       | "nöbetçi" logo yazısı                           |
| `--t-list`    | 17px / 700 / Archivo     | —              | İlçe satırı                                     |
| `--t-btn`     | 16–17px / 800 / Archivo  | `-.01em`       | Buton etiketi                                   |
| `--t-item`    | 16px / 700 / Archivo     | —              | Liste eczane adı                                |
| `--t-body`    | 15px / 400–500 / Inter   | —              | Açıklama, ikincil buton (`line-height:1.55`)    |
| `--t-meta`    | 14px / 400 / Inter       | —              | "1.2 km · 4 dk araçla"                          |
| `--t-sub`     | 13px / 400 / Inter       | —              | Adres, ilçe meta (`line-height:1.45`)           |
| `--t-badge`   | 13px / 700 / Archivo     | —              | Durum rozeti                                    |
| `--t-chip`    | 12px / 700–800 / Archivo | —              | Pin mesafe etiketi, liste saati                 |
| `--t-caption` | 11px / 600 / Inter       | `.08em`        | Bölüm başlığı (`text-transform: uppercase`)     |
| `--t-tag`     | 11px / 800 / Archivo     | `.1em`         | Ekran numarası rozeti (yalnız canvas)           |

### Kurallar

- **Tüm sayısal içerik** (mesafe, süre, saat, tarih) `font-variant-numeric: tabular-nums`.
  Canlı güncellenen mesafe/geri sayım zıplamasın.
- Uzun başlıklarda `text-wrap: balance` (izin ekranı), `text-wrap: pretty` (ilçe başlığı).
- Archivo asla 400 ağırlıkta kullanılmaz; en düşük 500.

---

## 3 · Boşluk

4px tabanlı, ama **6'lı adımlar baskın**. İzinli değerler:

```
2 · 3 · 4 · 5 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 26 · 32 · 38 · 40 · 56
```

| Bağlam                     | Değer                                              |
| -------------------------- | -------------------------------------------------- |
| Ekran yatay kenar boşluğu  | `22px` (izin/ilçe/sheet), `18px` (kart konteyneri) |
| Sheet iç padding           | `0 18px 22px`                                      |
| Kart iç padding            | `18px` (birincil), `16px` (half)                   |
| Kart içi dikey aralık      | `12px`                                             |
| Kart metin satırları arası | `5–6px`                                            |
| Buton grubu aralığı        | `10–12px`                                          |
| Liste satırı padding       | `14–15px 4px`                                      |
| Alt güvenli alan           | `40px` (home indicator)                            |
| Üst durum çubuğu           | `16px 26px 0`                                      |

---

## 4 · Köşe yuvarlaklığı

| Token          | Değer                | Kullanım                                                           |
| -------------- | -------------------- | ------------------------------------------------------------------ |
| `--r-pin`      | `18px 18px 18px 6px` | Harita pini — **asimetrik**, sol-alt köşe sivri (konum işaretçisi) |
| `--r-pin-sm`   | `13px 13px 13px 5px` | İkincil pin (38px)                                                 |
| `--r-pin-lg`   | `20px 20px 20px 7px` | Seçili pin (60px)                                                  |
| `--r-card`     | `22px`               | Eczane kartı                                                       |
| `--r-btn`      | `18px`               | Buton (kart içi)                                                   |
| `--r-btn-lg`   | `20px`               | Tam genişlik buton                                                 |
| `--r-sheet`    | `26px 26px 0 0`      | Bottom sheet üst köşeler                                           |
| `--r-icon`     | `14px`               | 44px ikon buton                                                    |
| `--r-icon-lg`  | `16px`               | 48px ikon buton                                                    |
| `--r-field`    | `18px`               | Arama alanı                                                        |
| `--r-badge`    | `10px`               | Durum rozeti                                                       |
| `--r-chip`     | `5–6px`              | Mesafe etiketi                                                     |
| `--r-app-icon` | `30px`               | 96px uygulama ikonu (izin ekranı)                                  |
| `--r-handle`   | `3px`                | Sheet tutamağı                                                     |

Pinin asimetrik köşesi **kimlik unsurudur**, simetriğe çevrilmez.

---

## 5 · Gölge

| Token            | Değer                                 | Kullanım                                      |
| ---------------- | ------------------------------------- | --------------------------------------------- |
| `--sh-sheet`     | `0 -18px 44px rgba(0,0,0,.5–.55)`     | Bottom sheet (açık tema: `rgba(15,20,25,.1)`) |
| `--sh-pin`       | `0 10px 26px rgba(20,192,138,.4)`     | Aktif yeşil pin                               |
| `--sh-pin-sel`   | `0 14px 34px rgba(255,154,60,.42)`    | Seçili turuncu pin                            |
| `--sh-pin-light` | `0 10px 24px rgba(14,143,104,.28)`    | Açık tema pini                                |
| `--ring-user`    | `0 0 0 3–4px rgba(59,130,246,.25–.3)` | Kullanıcı noktası halkası                     |

---

## 6 · Boyut ve dokunma hedefi

| Öğe                           | Boyut                                     | Not                           |
| ----------------------------- | ----------------------------------------- | ----------------------------- |
| Birincil buton (tam genişlik) | `h 60px`                                  | İzin ekranı, çevrimdışı, ilçe |
| Birincil buton (kart içi)     | `h 58px` · `flex 1.25`                    | "Yol Tarifi" — "Ara"dan geniş |
| İkincil buton (kart içi)      | `h 58px` · `flex 1`                       | "Ara" — outline               |
| İkincil buton (tam genişlik)  | `h 52–56px`                               | Outline                       |
| İkon buton                    | `44×44` (kart), `48×48` (harita)          |                               |
| Liste satırı                  | `min-height 64px` (eczane), `60px` (ilçe) |                               |
| Arama alanı                   | `h 56px`                                  |                               |
| Aktif pin                     | `52×52`                                   | + altında mesafe etiketi      |
| İkincil pin                   | `38×38` · `opacity .85`                   |                               |
| Seçili pin                    | `60×60`                                   | turuncu, büyütülmüş           |
| Kullanıcı noktası             | `20×20` · `border 3px` zemin rengi        |                               |
| Sheet tutamağı                | `44×5`                                    | dokunma alanı `h 26px`        |
| Uygulama ikonu                | `96×96`                                   |                               |
| Viewport referansı            | `390×844`                                 | iPhone 14/15                  |

**Aksiyon hiyerarşisi:** "Yol Tarifi" her zaman dolu ve daha geniş (`flex 1.25`);
"Ara" outline ve dar (`flex 1`). Bu oran korunur.

---

## 7 · Hareket

| Token           | Değer                                                | Kullanım               |
| --------------- | ---------------------------------------------------- | ---------------------- |
| `--ease-sheet`  | `cubic-bezier(.32,.72,0,1)`                          | Sheet yükseklik geçişi |
| `--dur-sheet`   | `320ms`                                              |                        |
| `--dur-pulse`   | `2.6s` (uygulama ikonu) · `2.8s` (kullanıcı noktası) | `ease-out infinite`    |
| `--dur-shimmer` | `1.5s` (skeleton) · `1.8s` (harita)                  | `ease-in-out infinite` |

```css
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.55;
  }
  70% {
    transform: scale(3.2);
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
@keyframes shimmer {
  0% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.85;
  }
  100% {
    opacity: 0.35;
  }
}
```

`prefers-reduced-motion: reduce` altında pulse ve shimmer durur, sheet geçişi `0ms` olur.

---

## 8 · Bottom sheet — üç kademe

| Kademe | Yükseklik | Görünen                                               |
| ------ | --------- | ----------------------------------------------------- |
| `peek` | `300px`   | Yalnızca birincil eczane kartı                        |
| `half` | `460px`   | Kart + "Yakındaki diğer eczaneler" (4 satır)          |
| `full` | `724px`   | Kart + tam liste + kapalı eczaneler + "İlçe değiştir" |

Tutamağa tıklama döngüsü: `peek → half → full → peek`.
Sürükleme jesti de aynı kademelere oturur (tasarımda tıklama ile gösterilmiş).
`full` içindeki kapalı eczaneler `opacity: .45`.

---

## 9 · Durum davranışları

| Durum                    | Tasarım karşılığı                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yükleniyor**           | Harita shimmer dokusu + sheet içinde skeleton bloklar (`62% / 40% / 78%` genişlik) + spinner ve "Yakınındaki eczaneler bulunuyor…"                    |
| **İzin reddedildi**      | `06` — ilçe seçim listesi, her satırda nöbetçi sayısı, altta sabit "Konum iznini tekrar dene"                                                         |
| **Çevrimdışı**           | `07` — üstte turuncu bant + kayıt saati, kartta "Kayıtlı bilgi · 03:02" rozeti, **"Yol Tarifi" yerine "Ara"** birincil olur, ikincil "Adresi kopyala" |
| **Nöbeti bitmiş eczane** | `opacity .45`, sağda `#E05A5A` "Kapalı", mesafe yerine "Nöbeti bitti"                                                                                 |
| **Yakında kapanıyor**    | Turuncu rozet "43 dakika sonra kapanıyor"; seçilirse **kartın tamamı** turuncu varyanta geçer (zemin `#231A11`, kenarlık `#4A3620`, butonlar turuncu) |
| **Boş liste**            | Tasarımda yok — `06` başlık üslubunda ("… bulamadım") metinle çözülür, sorulmadan görsel üretilmez                                                    |

Rozet metni **kalan süreye göre** değişir: >2 saat → yeşil "Sabah HH:MM'a kadar açık";
≤2 saat → turuncu "N dakika sonra kapanıyor"; bitti → kırmızı "Kapalı".

---

## 10 · Ses tonu

Birinci tekil şahıs, yardımcı, kısa. Tasarımdaki metinler:

- "Gece açık eczaneyi hemen göster**eyim**"
- "Nerede olduğunu bilirsem en yakınını bul**urum**. Kayıt yok, reklam yok."
- "Nerede olduğunu bula**madım**, ilçeni seçer misin?"
- "Yakınındaki eczaneler bulunuyor…"
- "03:02'de kaydettiğim listeyi gösteriyorum. Yola çıkmadan telefonla teyit et."

Kurumsal dil ("Lütfen bekleyiniz", "İşleminiz gerçekleştiriliyor") kullanılmaz.
Butonlar Archivo 800 ve emir kipi: "Konumumu kullan", "Yol Tarifi", "Ara", "Tekrar dene".
