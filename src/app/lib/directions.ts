/**
 * Yol tarifi — kullanıcının cihazındaki yerel harita uygulamasına yönlendirme.
 *
 * Mobil cihazlarda (Android / iOS) cihazın kendi native harita seçim ve yönlendirme
 * mekanizması tetiklenir (Android'de `geo:` intent picker, iOS'ta `maps://` şeması).
 * Masaüstü tarayıcılarda Google Maps sekmesi açılır.
 */

export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export const isMobile = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Hedefe sürüş yol tarifi açar.
 * Android cihazlarda `geo:` intent protokolü ile işletim sisteminin kendi harita seçici popup'ını tetikler.
 * iOS cihazlarda `maps://` protokolü ile harita uygulamasını açar.
 * Masaüstünde Google Maps web sekmesinde açar.
 */
export function openDirections(lat: number, lng: number, label?: string): void {
  const dest = `${lat},${lng}`;
  const encodedLabel = label ? encodeURIComponent(label) : '';

  if (isAndroid()) {
    // Android `geo:` URI şeması: Telefon cihazdaki yüklü harita uygulamalarını (Google Maps, Yandex Navi, Waze vb.) kendi yerel popup'ı ile sunar.
    const geoUri = label ? `geo:${dest}?q=${dest}(${encodedLabel})` : `geo:${dest}?q=${dest}`;
    window.location.href = geoUri;
    return;
  }

  if (isIOS()) {
    // iOS `maps://` URI şeması: Apple Haritalar ve iOS native harita istemcisini tetikler.
    const q = encodedLabel ? `&q=${encodedLabel}` : '';
    window.location.href = `maps://?daddr=${dest}&dirflg=d${q}`;
    return;
  }

  // Masaüstü web tarayıcıları için Google Maps
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
