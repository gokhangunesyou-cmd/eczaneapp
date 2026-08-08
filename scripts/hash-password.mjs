#!/usr/bin/env node
/**
 * Admin parolası için PBKDF2-SHA256 hash üretir.
 *
 *   node scripts/hash-password.mjs
 *   node scripts/hash-password.mjs 'parolam'
 *
 * Çıktı biçimi (tek satır, `.dev.vars` veya `wrangler secret put` için):
 *
 *   pbkdf2$sha256$210000$<salt-base64>$<hash-base64>
 *
 * Neden PBKDF2: bcrypt/argon2 native Node eklentisidir ve Cloudflare Workers
 * runtime'ında çalışmaz. PBKDF2 WebCrypto'da yerleşiktir, sıfır bağımlılık.
 * Doğrulama kodu Worker tarafında aynı parametrelerle bu diziyi yeniden üretip
 * sabit zamanlı karşılaştırır.
 *
 * Bu script ürettiği değeri HİÇBİR dosyaya yazmaz. Ekrana basar; `.dev.vars`'a
 * kopyalamak kullanıcının işidir.
 */

import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

// Cloudflare ÜCRETSİZ planında istek başına 10 ms CPU var ve PBKDF2 doğrulaması
// bu bütçeden harcanıyor. Ölçüldü (production, 2026-08-08):
//   210.000 → her istek 500       100.000 → 6 denemede 4 başarılı (kararsız)
//    75.000 → 6/6                  60.000 → 10/10  ← seçilen, soğuk başlangıç payıyla
//
// 60.000, OWASP'ın önerdiği değerin altındadır. Bu YALNIZCA parola YÜKSEK
// ENTROPİLİ olduğu sürece kabul edilebilir: aşağıdaki uzunluk/çeşitlilik kontrolü
// bu yüzden var. Kısa ya da tahmin edilebilir parola kullanılırsa bu denge bozulur.
const ITERATIONS = 60_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const b64 = (buf) => Buffer.from(buf).toString('base64');

async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    KEY_BITS,
  );
}

async function prompt() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question('Parola: ');
  rl.close();
  return answer;
}

// Yerel geliştirmede kısa parolaya izin verilir; production'da ASLA.
// Bayrak açıkça verilmedikçe politika uygulanır.
const allowWeak = process.argv.includes('--allow-weak');
const args = process.argv.slice(2).filter((a) => a !== '--allow-weak');

const password = args[0] ?? (await prompt());

if (!password) {
  process.stderr.write('Parola boş olamaz.\n');
  process.exit(1);
}
// Düşük iterasyon sayısını parola entropisiyle telafi ediyoruz (yukarıdaki nota
// bakınız) — bu yüzden zayıf parola KABUL EDİLMEZ.
const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
  re.test(password),
).length;

if (!allowWeak && (password.length < 16 || classes < 3)) {
  process.stderr.write(
    '\nParola en az 16 karakter olmalı ve küçük harf, büyük harf, rakam,\n' +
      'sembol sınıflarından en az 3\u0027ünü içermeli.\n\n' +
      'Neden: ücretsiz planın 10 ms CPU sınırı yüzünden PBKDF2 iterasyonu\n' +
      '60.000\u0027de tutuluyor (OWASP önerisinin altında). Güvenlik parolanın\n' +
      'entropisinden geliyor. Rastgele üretmek için:\n' +
      '  openssl rand -base64 24\n\n' +
      'Yalnızca YEREL geliştirme için politikayı atlamak istersen: --allow-weak\n\n',
  );
  process.exit(1);
}

if (allowWeak) {
  process.stderr.write(
    '\n⚠  --allow-weak: parola politikası atlandı. Bu hash PRODUCTION\u0027a KOYULMAZ.\n',
  );
}

const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
const hash = await derive(password, salt);

const encoded = `pbkdf2$sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;

process.stderr.write('\nADMIN_PASSWORD_HASH değeri (aşağıdaki satırı kopyala):\n\n');
process.stdout.write(encoded + '\n');
process.stderr.write(
  '\nGeliştirme: .dev.vars içine ADMIN_PASSWORD_HASH="..." olarak yapıştır.\n' +
    'Production: npx wrangler secret put ADMIN_PASSWORD_HASH  (sen çalıştır)\n\n',
);
