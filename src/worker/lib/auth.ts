/**
 * Admin kimlik doğrulama — PBKDF2 parola + HMAC imzalı oturum çerezi.
 *
 * Kimlik bilgileri KODDA SABİT DEĞİLDİR. `env` üzerinden gelir:
 *   geliştirme  → .dev.vars
 *   production  → wrangler secret
 * Kod ikisini ayırt etmez.
 *
 * bcrypt/argon2 kullanılmaz — native Node eklentileridir, Workers runtime'ında
 * çalışmazlar. PBKDF2 WebCrypto'da yerleşiktir.
 *
 * İTERASYON SAYISI CPU BÜTÇESİNE BAĞLIDIR. Ücretsiz planda istek başına 10 ms CPU
 * var; 210.000 iterasyon bunu aşıp isteği 500'e düşürüyor (production'da ölçüldü).
 * `scripts/hash-password.mjs` bu yüzden 60.000 üretiyor ve karşılığında güçlü
 * parola şart koşuyor. Buradaki üst sınır o gerçeği yansıtır — yükseltilirse
 * giriş production'da kırılır.
 */

const enc = new TextEncoder();

const b64encode = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const b64decode = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const b64url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlBack = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');

/**
 * Sabit zamanlı karşılaştırma. `===` ile hash karşılaştırmak timing sızıntısıdır:
 * eşleşen ön ek uzunluğu yanıt süresinden okunabilir.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * `pbkdf2$sha256$<iter>$<salt-b64>$<hash-b64>` biçimindeki hash'i doğrular.
 * Hash bozuksa `false` döner — asla fırlatmaz, çünkü hata mesajı saldırgana
 * "kullanıcı adı doğruydu" bilgisi verir.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;

  const iterations = Number(parts[2]);
  // Üst sınır CPU bütçesinden gelir (yukarıdaki nota bakınız), keyfî değil.
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 120_000) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = b64decode(parts[3]!);
    expected = b64decode(parts[4]!);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    expected.length * 8,
  );

  return timingSafeEqual(new Uint8Array(bits), expected);
}

// ─── Oturum çerezi ──────────────────────────────────────────────────────────
// Biçim: base64url(payloadJSON) + '.' + base64url(HMAC-SHA256)
// Sunucu tarafında durum tutulmaz; D1'e oturum yazılmaz.

export type SessionPayload = {
  /** kullanıcı adı */
  u: string;
  /** son kullanma — epoch saniye */
  e: number;
};

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(b64encode(enc.encode(JSON.stringify(payload))));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(b64encode(sig))}`;
}

/** Geçersiz, bozuk veya süresi dolmuş oturumda `null` döner. */
export async function verifySession(
  token: string,
  secret: string,
  now: Date,
): Promise<SessionPayload | null> {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let sig: Uint8Array;
  try {
    sig = b64decode(b64urlBack(sigPart));
  } catch {
    return null;
  }

  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(body));
  if (!ok) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64decode(b64urlBack(body)))) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload?.u !== 'string' || typeof payload?.e !== 'number') return null;
  if (payload.e * 1000 <= now.getTime()) return null;

  return payload;
}

export const SESSION_COOKIE = 'session';

export function buildSessionCookie(token: string, ttlSeconds: number, secure: boolean): string {
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${ttlSeconds}`,
  ];
  // localhost'ta Secure çerez http üzerinden kabul edilmez.
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const flags = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
