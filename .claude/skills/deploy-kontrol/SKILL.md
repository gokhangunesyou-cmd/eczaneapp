---
name: deploy-kontrol
description: >-
  Yayına çıkmadan önceki tam kontrol zinciri: lint + test + build + wrangler dry-run.
  Hepsi yeşilse deploy komutunu ÇALIŞTIRMAZ, kullanıcıya söyler. "Deploy edelim",
  "yayına çıkalım", "canlıya alalım", "deploy'a hazır mıyız", "sürüm çıkaralım",
  "prod'a atalım" gibi isteklerde ve bir dilim tamamlanıp commit öncesi doğrulama
  istendiğinde tetiklenir.
---

# Deploy kontrol

**Bu skill deploy etmez.** Dört kapıyı sırayla geçirir; hepsi yeşilse kullanıcının
çalıştıracağı komutu yazar. `wrangler deploy` bu oturumda **hiçbir koşulda**
çalıştırılmaz — `CLAUDE.md` kuralı ve `scripts/guard-bash.mjs` tarafından engellenir.

Bir kapı kırmızıysa **dur**. Sonraki kapıya geçme, hatayı düzelt, zinciri baştan koştur.

---

## Kapı 1 · Lint

```
npm run lint
```

Kapsam: `tsc -b` + `eslint` + `prettier --check`.

- `--fix` ile geçiştirme; hook zaten yazma anında düzeltiyor. Burada hâlâ hata varsa
  otomatik düzeltilemeyen gerçek bir sorun var demektir.
- `tsc` hatası **asla** `@ts-ignore` ile susturulmaz. Tip hatası sözleşmeden sapma
  işaretidir; `contracts/openapi.yaml` ile kodu karşılaştır.

## Kapı 2 · Test

```
npm run test
npm run test:e2e
```

- Atlanmış (`skip`, `only`) test kaldı mı bak. `only` varsa diğer testler koşmamıştır.
- Yeni bir uç veya ekran eklendiyse testi de eklenmiş olmalı. Yoksa deploy etme,
  testi yaz.
- Playwright yerel `npm run dev`'e karşı koşar. Ağa çıkan test olmamalı.

## Kapı 3 · Build

```
npm run build
```

- Build çıktısının boyutuna bak. Ana bundle **250 KB gzip**'i geçtiyse dur ve nedenini
  söyle — MapLibre ayrı chunk'ta mı, `React.lazy` bölünmesi bozulmuş mu.
- Worker paketi 3 MB (gzip) sınırının altında olmalı — ücretsiz plan limiti.
- `dist/` içinde `.map` dosyası prod'a gitmemeli.

## Kapı 4 · Wrangler dry-run

```
npx wrangler deploy --dry-run
```

Bu komut **hiçbir şey yayınlamaz**, yalnızca paketleme ve yapılandırmayı doğrular.

Çıktıda şunları kontrol et:

- **Binding'ler:** `DB` (D1) bağlı mı, veritabanı adı ve `database_id` doğru mu.
- **Cron trigger:** ŞU AN YOK (ADR-004: veri panelden giriliyor). Dry-run çıktısında
  cron görünüyorsa biri eklemiş demektir — nedenini sor. Ücretsiz plan: 5 cron/hesap.
- **Özel alan adı:** `nobetcieczane.becayisler.com` custom_domain olarak listelenmeli.
- **Static assets:** `assets` dizini bağlı mı, dosya sayısı 20.000'in altında mı,
  tek dosya 25 MiB'ı geçmiyor mu.
- **`compatibility_date`** güncel mi.
- **Uyarılar:** wrangler'ın ürettiği her uyarı okunur ve kullanıcıya aktarılır.

## Kapı 5 · Sızıntı ve yapılandırma denetimi

Otomatik komutlar geçse bile şunlara bakılır:

```
git status --porcelain          # takip edilmeyen/eklenmemiş dosya var mı
git diff --cached --stat        # commit'e ne giriyor
```

- `.dev.vars`, `.env*`, `.wrangler/`, `.claude/settings.local.json` **commit'e girmemeli**.
  Girmişse dur, `.gitignore`'u ve indeksi düzelt.
- Kaynak kodda sabit kimlik bilgisi, API anahtarı, parola veya hash var mı ara.
  Hepsi `env`'den gelmeli.
- `VITE_` önekli değişkenler istemci paketine gömülür ve **gizli değildir**. Bu önekle
  gizli bir değer taşınıyorsa dur.
- Yeni bir ortam değişkeni eklendiyse `.dev.vars.example`'da yorumuyla var mı bak;
  yoksa ekle ve kullanıcıya prod secret'ını da kurması gerektiğini hatırlat.
- `contracts/openapi.yaml` değiştiyse `src/shared/api-types.d.ts` yeniden üretilmiş
  ve commit'e dahil edilmiş olmalı.

---

## Rapor

Beş kapı da yeşilse **dur** ve kullanıcıya şu biçimde rapor ver:

```
Deploy kontrolü tamam.

  lint      ✓
  test      ✓  (N birim, M e2e)
  build     ✓  (ana bundle X KB gzip, worker Y KB)
  dry-run   ✓  (D1: nobetci-eczane · cron: 0 · assets: N dosya)
  denetim   ✓  (sızıntı yok, sözleşme–tip senkron)

İlk deploy öncesi bir kereye mahsus (senin çalıştırman gerekiyor):

  npx wrangler d1 create nobetci-eczane
  # dönen database_id'yi wrangler.jsonc'ye yaz
  npx wrangler d1 migrations apply nobetci-eczane --remote
  npx wrangler secret put ADMIN_USERNAME
  npx wrangler secret put ADMIN_PASSWORD_HASH     # scripts/hash-password.mjs ile üret
  npx wrangler secret put SESSION_SECRET

Deploy:

  npm run deploy

Deploy sonrası doğrulama:

  curl https://nobetcieczane.becayisler.com/api/health
  # İlk deploy'da veri girilmediği için "degraded" NORMALDİR.
  # /admin → giriş → Nöbet takvimi → bugüne eczane ata → tekrar kontrol et.
```

Bir kapı kırmızıysa: hangi kapı, tam hata çıktısı, ne yapılması gerektiği. Deploy
komutunu **verme**.

---

## Yapılmayacaklar

- `wrangler deploy` çalıştırmak (dry-run hariç)
- `wrangler d1 execute --remote` veya `--remote` içeren herhangi bir komut çalıştırmak
- `wrangler secret put` çalıştırmak — değeri kullanıcı girer
- Kırmızı kapıyı atlayıp sonrakine geçmek
- Testi `skip` ederek zinciri yeşile boyamak
- Kotayı aşabilecek bir değişikliği (istek yolunda kaynak çağrısı, cache katmanının
  kaldırılması, `SELECT *`) rapor etmeden geçirmek
