import { useCallback, useState } from 'react';

/**
 * Konum izni durumu.
 *
 * `denied` bir HATA DEĞİLDİR — alternatif akıştır (ilçe seçimi, tasarım ekranı 06).
 * Kullanıcı suçlanmaz, uyarı gösterilmez.
 */
export type GeoState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'denied' }
  | { status: 'unavailable' };

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // Gece 3'te ilaç arayan biri 20 saniye bekleyemez.
  timeout: 8000,
  // 2 dakikalık önbellek kabul edilir; eczane mesafesi için fazlasıyla yeterli.
  maximumAge: 120_000,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable' });
      return;
    }

    setState({ status: 'requesting' });

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: 'granted',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) => {
        // PERMISSION_DENIED = 1 → kullanıcı reddetti
        // POSITION_UNAVAILABLE = 2, TIMEOUT = 3 → cihaz/ağ sorunu
        setState(
          err.code === err.PERMISSION_DENIED ? { status: 'denied' } : { status: 'unavailable' },
        );
      },
      OPTIONS,
    );
  }, []);

  const decline = useCallback(() => setState({ status: 'denied' }), []);

  return { state, request, decline };
}
