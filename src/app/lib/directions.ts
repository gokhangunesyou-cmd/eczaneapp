/**
 * Yol tarifi — kullanıcının kendi harita uygulamasına deep link.
 *
 * ADR-002: yönlendirme motoru KULLANILMIYOR. Ne anahtar, ne kota, ne sunucu.
 * Kullanıcı sesli navigasyonu zaten alışkın olduğu uygulamada alır.
 */

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ kendini Mac gibi tanıtır.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Hedefe sürüş yol tarifi açar.
 *
 * Android → Google Maps native
 * iOS     → Google Maps kuruluysa o, değilse Apple Maps
 * Masaüstü→ Google Maps web
 */
export function openDirections(lat: number, lng: number, label?: string): void {
  const dest = `${lat},${lng}`;

  if (isIOS()) {
    // Apple Maps evrensel şeması; Google Maps kuruluysa iOS onu önerir.
    const q = label ? `&q=${encodeURIComponent(label)}` : '';
    window.location.href = `maps://?daddr=${dest}&dirflg=d${q}`;
    return;
  }

  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
    '_blank',
    'noopener,noreferrer',
  );
}

/** `tel:` bağlantısı — telefon E.164 biçiminde saklanır. */
export function callPhone(phone: string): void {
  window.location.href = `tel:${phone}`;
}

/** Çevrimdışı ekranında "Adresi kopyala" için. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
