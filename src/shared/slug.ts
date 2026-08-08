/**
 * Türkçe metinden slug üretimi.
 *
 * Slug bu projede **doğal anahtardır** (ADR-005): kaynak eczane için kalıcı bir
 * kimlik vermediğinden `il/ilçe/eczane` üçlüsünden türetilen slug kimlik yerine
 * geçer. Bu yüzden kuralları DEĞİŞTİRMEK VERİ BOZAR — aynı eczane yeni bir slug
 * üretirse mükerrer kayıt açılır ve koordinatı kaybolur.
 *
 * Hem Worker hem CLI aynı fonksiyonu kullanır; iki yerde ayrı yazılmaz.
 */

const TR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  i: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
  â: 'a',
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
};

/**
 * `HACI İLYAS ECZANESİ` → `haci-ilyas-eczanesi`
 *
 * `toLowerCase()` TEK BAŞINA YETMEZ: Türkçe'de `I` → `ı` olmalı ama JS varsayılan
 * yerelde `I` → `i` verir. Harf eşlemesi bu yüzden küçültmeden ÖNCE yapılır.
 */
export function slugify(input: string): string {
  const mapped = [...input].map((ch) => TR_MAP[ch] ?? ch).join('');

  return mapped
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // kalan aksanlar
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Eczanenin doğal anahtarı: `il/ilçe/eczane`.
 *
 * Örnek: `antalya/akseki/murtici`
 */
export function pharmacySlug(citySlug: string, districtSlug: string, name: string): string {
  return `${citySlug}/${districtSlug}/${slugify(name)}`;
}
