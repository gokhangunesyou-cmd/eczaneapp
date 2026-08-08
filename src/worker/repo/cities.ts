/**
 * İl çözümleme (ADR-006).
 *
 * Kullanıcının hangi ilde olduğunu bulmak için reverse geocoding KULLANILMAZ:
 * MapTiler'ın ücretsiz kotası harita yüklemesi için ayrılmış, il tespitine
 * harcanmaz. Bunun yerine kendi verimize bakılır.
 *
 * Sıra:
 *   1. Kullanıcının etrafındaki küçük kutuda **en yakın eczane** → onun ili.
 *      Sınır bölgelerinde bile doğru sonuç verir, çünkü "hangi ile yakınım"
 *      değil "hangi ilin eczanesine yakınım" sorusunu cevaplar.
 *   2. Kutu boşsa → **merkezi en yakın il** (`city.lat/lng`, migration 0004).
 *      Bu durumda liste boş döner ama kullanıcı doğru il adını görür.
 */

import { haversineMeters } from '@shared/geo';

/**
 * Kutu yarıçapı (derece). ~0.6° ≈ 66 km kuzey-güney.
 * Büyütmek D1 satır okumasını büyütür; bu değer bir ilçe merkezinden komşu
 * ilçelere ulaşmaya yeter, tüm ülkeyi taramaya yetmez — kasıtlı.
 */
const BOX_DEGREES = 0.6;

/** Kutudan okunacak azami eczane. Mesafe hesabı Worker'da yapılıyor (CPU). */
const BOX_LIMIT = 50;

export async function resolveCityByLocation(
  db: D1Database,
  lat: number,
  lng: number,
): Promise<number | null> {
  const { results } = await db
    .prepare(
      `SELECT p.lat, p.lng, d.city_code
       FROM pharmacy p JOIN district d ON d.code = p.district_code
       WHERE p.lat BETWEEN ?1 AND ?2 AND p.lng BETWEEN ?3 AND ?4
       LIMIT ?5`,
    )
    .bind(lat - BOX_DEGREES, lat + BOX_DEGREES, lng - BOX_DEGREES, lng + BOX_DEGREES, BOX_LIMIT)
    .all<{ lat: number; lng: number; city_code: number }>();

  if (results.length > 0) {
    let best = results[0]!;
    let bestDistance = haversineMeters(lat, lng, best.lat, best.lng);

    for (const r of results.slice(1)) {
      const d = haversineMeters(lat, lng, r.lat, r.lng);
      if (d < bestDistance) {
        best = r;
        bestDistance = d;
      }
    }
    return best.city_code;
  }

  // Yedek yol: veri hiç çekilmemiş bir ildeyiz. Yine de doğru il adı gösterilsin.
  const { results: centers } = await db
    .prepare('SELECT code, lat, lng FROM city WHERE lat IS NOT NULL LIMIT 81')
    .all<{ code: number; lat: number; lng: number }>();

  if (centers.length === 0) return null;

  let bestCode = centers[0]!.code;
  let bestDistance = haversineMeters(lat, lng, centers[0]!.lat, centers[0]!.lng);

  for (const c of centers.slice(1)) {
    const d = haversineMeters(lat, lng, c.lat, c.lng);
    if (d < bestDistance) {
      bestCode = c.code;
      bestDistance = d;
    }
  }

  return bestCode;
}
