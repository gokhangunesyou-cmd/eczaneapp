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

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 120_000,
};

const LOW_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 300_000,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable' });
      return;
    }

    setState({ status: 'requesting' });

    // Önce yüksek doğruluk denenir; timeout veya donanım yoksa düşük doğruluğa (Wi-Fi/IP) geçilir
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'granted',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: 'denied' });
          return;
        }

        // Timeout veya Position Unavailable: Hücresel/Wi-Fi yaklaşık konuma düş
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setState({
              status: 'granted',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          },
          () => {
            setState({ status: 'unavailable' });
          },
          LOW_ACCURACY_OPTIONS,
        );
      },
      HIGH_ACCURACY_OPTIONS,
    );
  }, []);

  const decline = useCallback(() => setState({ status: 'denied' }), []);

  return { state, request, decline };
}
