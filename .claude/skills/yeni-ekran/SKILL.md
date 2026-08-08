---
name: yeni-ekran
description: >-
  Arayüze yeni bir ekran, sayfa, görünüm veya komponent eklerken ve mevcut bir ekranın
  görünümünü değiştirirken kullanılır. Sıra zorunludur: tasarım token'larını uygula →
  komponent → loading/empty/error durumları → route. "Şu ekranı yap", "harita
  görünümünü ekle", "ilçe seçim sayfası", "kartı şöyle göstersin", "bu bileşeni
  ekle" gibi isteklerde tetiklenir. API tarafını ilgilendiren işlerde kullanılmaz —
  orada yeni-endpoint geçerlidir.
---

# Yeni ekran

Tasarım kararı **üretilmez**. `design/DESIGN-TOKENS.md` ve `design/nobetci-eczane.html`
tek doğru kaynaktır. Bir değer ikisinde de yoksa uydurma — dur ve kullanıcıya sor.

Adımlar sırayla; bir adım bitmeden sonrakine geçilmez.

---

## 1 · Token'ları uygula

Önce `design/DESIGN-TOKENS.md`'i oku. Sonra ilgili ekranı
`design/nobetci-eczane.html` içinde `data-screen-label` ile bul ve gerçek değerlere bak.

- Renk, boşluk, radius, gölge, tipografi **yalnızca CSS değişkenlerinden** gelir.
  Ham hex, `px` gölge, rastgele boşluk yazma.
- Token'da olmayan bir değer gerekiyorsa: önce tasarım HTML'inde ara. Varsa
  `DESIGN-TOKENS.md`'e ekle, sonra kullan. Yoksa **dur ve sor**.
- Koyu tema birincildir. Açık tema değerleri ayrı token'dır — yeşil iki temada farklı
  (`#14C08A` / `#0E8F68`), opaklık varyantı değil.
- Sayısal içerik (mesafe, süre, saat) `font-variant-numeric: tabular-nums`.
- Archivo yalnızca başlık/buton/sayı, en düşük ağırlık 500. Gövde Inter.

## 2 · Komponent

`src/app/components/` (paylaşılan) veya `src/app/screens/` (ekran) altına.

- Tek sorumluluk. Ekran komponenti veri çeker ve düzenler; sunum komponenti prop alır
  ve çizer, `fetch` yapmaz.
- Props tipleri `src/shared/api-types.d.ts`'ten türetilir. Elle `Pharmacy` tipi yazma.
- Dokunma hedefleri tasarımdaki ölçülerde: birincil buton 58–60px, liste satırı min
  64px, ikon buton 44px. Küçültme.
- Aksiyon hiyerarşisi korunur: "Yol Tarifi" dolu ve `flex: 1.25`, "Ara" outline ve
  `flex: 1`.
- Erişilebilirlik: her interaktif öğe klavyeyle ulaşılabilir, ikon butonda
  `aria-label`, canlı güncellenen durum metninde `aria-live="polite"`.
- `prefers-reduced-motion: reduce` altında pulse/shimmer durur, sheet geçişi `0ms`.
- MapLibre `React.lazy` ile ayrı chunk'ta kalır — ilk ekran haritasız açılır.

## 3 · Loading / empty / error durumları

**Üçü de yazılmadan komponent bitmiş sayılmaz.** Tasarım her birini çözmüş:

| Durum          | Tasarım karşılığı                                                                                                     | Kural                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Loading**    | `02 Yükleniyor` — harita shimmer + sheet içinde skeleton bloklar (`62%/40%/78%`) + "Yakınındaki eczaneler bulunuyor…" | Spinner tek başına yeterli değil. Skeleton gerçek düzenin iskeletini taşır ki geçişte zıplama olmasın.            |
| **Empty**      | Tasarımda ayrı ekran yok                                                                                              | `06`'nın ses tonuyla metin yazılır ("… bulamadım"). Görsel uydurulmaz; yeni bir illüstrasyon gerekiyorsa sor.     |
| **Error**      | `07 Çevrimdışı` — turuncu bant + kayıt saati + "Kayıtlı bilgi" rozeti                                                 | Ağ hatasında son bilinen veri gösterilir, birincil aksiyon **"Ara"** olur. Bayat veriyle navigasyona gönderilmez. |
| **İzin reddi** | `06 İlçe seçimi`                                                                                                      | Hata değil, alternatif akış. Kullanıcı suçlanmaz.                                                                 |

Ek kurallar:

- API yanıtındaki `stale: true` **her zaman** görünür bir işarete dönüşür. Sessizce
  bayat veri gösterme.
- Hata mesajı API'nin `error.message` alanından gelir (Türkçe ve kullanıcıya
  gösterilebilir). HTTP kodunu veya stack trace'i ekrana yazma.
- Her hata durumunda bir çıkış yolu olur: "Tekrar dene", "İlçemi seçeyim" gibi.

## 4 · Route

`src/app/routes.tsx`.

- Yol Türkçe ve kısa: `/`, `/ilce/:kod`, `/admin`.
- Ekran `React.lazy` ile bölünür; `Suspense` fallback'i **2. adımdaki skeleton**'dır,
  boş div değil.
- Konum izni durumu route'u belirler: izin var → harita, yok → ilçe seçimi. Bu karar
  tek yerde verilir, her komponentte tekrar edilmez.
- Derin bağlantı çalışır: `/ilce/0715` doğrudan açıldığında ilçe listesi gelir.
- `document.title` her ekranda güncellenir.

## 5 · Test

- **Vitest + Testing Library:** loading, empty, error ve mutlu yol — dördü ayrı test.
  Test kullanıcının gördüğü metni sorgular (`getByRole`, `getByText`), CSS sınıfını değil.
- **Playwright smoke:** yalnızca kritik akış eklenir, toplam 3 testi geçmez.
  Ağır E2E yazma; CI süresini yer, karşılığını vermez.

## 6 · Kapanış

```
npm run lint && npm run test
```

Yeşilse dur ve kullanıcıya bildir: hangi ekran eklendi, hangi tasarım ekranına karşılık
geliyor, hangi durumlar kapsandı, `DESIGN-TOKENS.md`'e bir şey eklendi mi. Commit'i
kullanıcı atar.

---

## Yapılmayacaklar

- Token'da olmayan renk/boşluk/radius uydurmak
- Ham hex veya `px` değer yazmak
- Loading/empty/error'dan birini atlayıp "sonra ekleriz" demek
- Skeleton yerine boş `<div>` veya tek spinner koymak
- `stale` veriyi işaretsiz göstermek
- Dokunma hedeflerini küçültmek
- Tasarımda olmayan bir ekran/illüstrasyon icat etmek
- MapLibre'ı ana bundle'a sokmak
