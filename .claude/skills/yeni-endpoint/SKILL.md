---
name: yeni-endpoint
description: >-
  API'ye yeni bir uç eklerken, mevcut bir ucun istek/yanıt şeklini değiştirirken veya
  contracts/openapi.yaml'a dokunulan her işte kullanılır. Sıra zorunludur:
  openapi.yaml → tip üretimi → zod şeması → Hono route → D1 sorgusu → Vitest testi.
  "Şu endpoint'i ekle", "API'ye X ucu lazım", "yanıta şu alanı ekle", "endpoint'in
  parametresi değişsin" gibi isteklerde tetiklenir. Yalnızca arayüz tarafını
  ilgilendiren işlerde kullanılmaz — orada yeni-ekran geçerlidir.
---

# Yeni endpoint

Sözleşme önce gelir. Kod sözleşmeye uyar, sözleşme koda değil.
Adımlar sırayla ve **tek tek** yapılır; bir adım bitmeden sonrakine geçilmez.

---

## 1 · `contracts/openapi.yaml`

Önce sözleşmeyi yaz. Uç zaten varsa ilgili bölümü değiştir.

- `operationId` benzersiz ve camelCase — üretilen tip adları bundan türüyor.
- Her şema `additionalProperties: false`. Sözleşmede olmayan alan yanıtta olmaz.
- Nullable alanlar `type: [string, 'null']` ile — OpenAPI 3.1 sözdizimi, `nullable: true` değil.
- Her yanıt kodu tanımlı: en az `200` ve `400`. Kimlik gerektiren uçlarda `401`.
  Kaynağa giden uçlarda `502`. Kota harcayan uçlarda `429`.
- Hata gövdesi **her zaman** `#/components/schemas/Error`. Yeni bir hata şekli üretme.
- Yeni bir hata sebebi gerekiyorsa `Error.code` enum'una ekle; serbest metin kod kullanma.
- Alan açıklamalarına birim yaz: metre mi km mi, dakika mı saniye mi, UTC mi yerel mi.

Örnek/`examples` bloğu ekle — hem doküman hem testin beklentisi olur.

## 2 · Tip üretimi

```
npm run gen:types
```

`src/shared/api-types.d.ts` yeniden üretilir. **Bu dosya elle düzenlenmez**, git'e
üretilmiş haliyle girer. `git diff` ile beklediğin değişikliğin geldiğini doğrula;
beklemediğin bir alan değiştiyse sözleşmede yanlış bir şey var demektir, 1'e dön.

## 3 · Zod şeması

`src/worker/schemas/` altına, uç ile aynı adı taşıyan dosyaya.

- Şema **çalışma anı doğrulaması** yapar; üretilen tipler derleme anı içindir. İkisi ayrı iş.
- Query parametrelerinde `z.coerce.number()` kullan — query string'ten her şey `string` gelir.
- Sınırları openapi.yaml'daki `minimum`/`maximum`/`pattern` ile **birebir** aynı yaz.
  Farklıysa sözleşme yalan söylüyor demektir.
- Karşılıklı dışlayan parametreler (`lat`+`lng` vs `district` gibi) `.refine()` ile
  kontrol edilir, route içinde `if` ile değil.
- Yanıtı da şemayla doğrula (`safeParse`) — yalnızca test ortamında, üretimde değil
  (CPU limiti). Bu, sözleşmeden sapmayı testte yakalar.

## 4 · Hono route

`src/worker/routes/` altına.

- `zValidator('query' | 'json', schema)` ile bağla. Elle `c.req.query()` okuyup
  doğrulama yazma.
- Route **ince** olur: doğrula → repository çağır → biçimlendir → dön. İş mantığı
  route'ta durmaz.
- Kaynak API'ye **asla** route içinden gidilmez. Veri D1'den okunur. (`docs/adr/003`)
- Kimlik gerektiren uçlar admin middleware'inin arkasına konur; route içinde elle
  çerez kontrolü yazılmaz.
- Hata yolları: yakalanan her hata `Error` şemasına dönüştürülür. `throw` edilen ham
  hata istemciye sızmaz. Mesaj **Türkçe ve kullanıcıya gösterilebilir** olur.
- Yanıt üretirken `satisfies` ile üretilen tipe bağla — sözleşmeden sapma derlemede patlasın.

## 5 · D1 sorgusu

`src/worker/repo/` altına.

- Her sorgu `prepare().bind()` ile. String birleştirme yok, istisnasız.
- `SELECT *` yok. Yalnızca kullanılan sütunlar — D1 satır okuma kotası ölçekte
  ilk patlayan kalem.
- Sonuç kümesini `LIMIT` ile sınırla. Sınırsız sorgu yazma.
- Yeni bir `WHERE` veya `ORDER BY` sütunu kullanıyorsan indeks var mı bak; yoksa
  `migrations/` altına yeni bir migration ekle. Mevcut migration dosyasını **değiştirme**.
- Migration ekledin mi `npm run db:migrate` ile yerelde uygula. `--remote` çalıştırma;
  komutu kullanıcıya söyle.
- Repository fonksiyonu `Response` üretmez, `c` görmez. Saf veri döndürür.

## 6 · Vitest testi

`src/worker/routes/__tests__/` altına, `@cloudflare/vitest-pool-workers` ile.

En az şu dört durum:

1. **Mutlu yol** — geçerli istek, `200`, yanıt sözleşmeye uyuyor (üretilen tiple `satisfies`).
2. **Doğrulama hatası** — eksik/aralık dışı parametre, `400`, `error.code === 'bad_request'`,
   `details` alan yolunu gösteriyor.
3. **Boş sonuç** — D1'de veri yok. `200` ve boş dizi döner; `404` **dönmez**
   (veri yokluğu hata değil, tasarımda boş durum ekranı var).
4. **Bayat veri** — bugünün senkronu yok. `stale: true` ve `dataAsOf` dünü gösteriyor.

Kimlik gerektiren uçlarda ek olarak: çerezsiz istek `401`.

Kurallar:

- Gerçek D1'e karşı koş, mock yazma. Fixture'ları migration + `INSERT` ile kur.
- Kaynak API'ye çıkan test yok — `FixtureAdapter` kullan.
- Zamana bağlı testte `vi.setSystemTime()` ile saati sabitle; nöbet rotasyonu 08:00 TRT.

## 7 · Kapanış

```
npm run lint && npm run test
```

İkisi de yeşilse dur ve kullanıcıya şunu bildir: hangi uç eklendi/değişti, sözleşmede
ne değişti, hangi migration eklendi, kaç test yazıldı. Commit'i kullanıcı atar.

---

## Yapılmayacaklar

- Sözleşmeyi atlayıp doğrudan route yazmak
- `src/shared/api-types.d.ts`'i elle düzenlemek
- Üretilen tiple zod şemasını çelişkiye düşürmek
- İstek yolunda kaynak API'ye gitmek veya Cache API katmanını atlamak
- `SELECT *` ve `LIMIT`siz sorgu
- Ham hata mesajını istemciye döndürmek
- Testi mock D1 ile yazmak
