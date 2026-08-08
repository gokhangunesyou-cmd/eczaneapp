/**
 * Mesafe ve süre tahmini.
 *
 * ADR-002: yönlendirme motoru KULLANILMIYOR. Yol tarifi kullanıcının native
 * harita uygulamasına deep link ile gider; buradaki süre yalnızca kartta
 * gösterilen bir TAHMİNDİR ve arayüzde `~` ile işaretlenir.
 */

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** İki nokta arası kuş uçuşu mesafe (metre). */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s)));
}

/**
 * Kuş uçuşu mesafeden tahmini sürüş süresi (dakika).
 *
 * İki düzeltme uygulanır:
 *  1. Dolambaç katsayısı — gerçek yol kuş uçuşundan uzundur (şehir içi ~1.35).
 *  2. Kademeli hız — kısa mesafede park/trafik payı ağır basar, uzun mesafede
 *     ana arter hızı baskındır.
 *
 * Tasarımdaki değerlerle tutarlıdır: 1.2 km → ~4 dk, 6.8 km → ~14 dk.
 */
export function estimateDriveMinutes(distanceM: number): number {
  const roadM = distanceM * 1.35;
  const km = roadM / 1000;

  const kmh = km < 2 ? 20 : km < 8 ? 28 : km < 25 ? 45 : 70;

  // En az 1 dakika — "0 dk" kullanıcıya bir şey anlatmaz.
  return Math.max(1, Math.round((km / kmh) * 60));
}

/**
 * Cache isabet oranını yükseltmek için koordinatı ~500 m ızgaraya yuvarlar.
 * Mesafe hassasiyetindeki kayıp kullanıcı için anlamsız derecede küçüktür,
 * ama D1 satır okuma kotasını korur (ADR-003).
 */
export function snapToGrid(lat: number, lng: number): { lat: number; lng: number } {
  // Enlemde 0.005° ≈ 555 m. Boylamda enleme bağlı; Antalya (~37°) için benzer.
  const step = 0.005;
  return {
    lat: Math.round(lat / step) * step,
    lng: Math.round(lng / step) * step,
  };
}

/** Metre → tasarımdaki gösterim: `1.2 km` / `840 m`. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
