import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap, type Marker as MlMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Pharmacy } from '@app/lib/api';

/**
 * MapLibre haritası — ADR-002.
 *
 * Bu komponent React.lazy ile ayrı chunk'ta kalır; ilk ekran (izin) ve liste
 * görünümü haritasız açılır. MapLibre ~220 KB gzip.
 *
 * Karo sağlayıcısı tek env değişkeninin arkasında: VITE_MAP_STYLE_URL.
 * Sağlayıcı değişirse bu dosya DEĞİŞMEZ.
 */

const DEFAULT_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || DEFAULT_STYLE_URL;

// Harita yapılandırma durumu kök elemente yazılır
if (typeof document !== 'undefined') {
  document.documentElement.dataset.mapConfig = STYLE_URL ? 'ok' : 'eksik';
}
const DEFAULT_LAT = Number(import.meta.env.VITE_MAP_DEFAULT_LAT ?? '36.8969');
const DEFAULT_LNG = Number(import.meta.env.VITE_MAP_DEFAULT_LNG ?? '30.7133');
const DEFAULT_ZOOM = Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM ?? '12');

type Props = {
  items: Pharmacy[];
  user?: { lat: number; lng: number };
  city?: { lat?: number | null | undefined; lng?: number | null | undefined };
  selectedId?: string;
  onSelect: (p: Pharmacy) => void;
};

/** Eczane pini — tasarımdaki asimetrik köşe (18 18 18 6) kimlik unsurudur. */
function pinElement(p: Pharmacy, selected: boolean): HTMLElement {
  const wrap = document.createElement('button');
  wrap.type = 'button';
  wrap.setAttribute('aria-label', p.name);
  wrap.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:0;cursor:pointer;padding:0';

  // Seçim yalnızca BOYUTU değiştirir. Renk yalnızca DURUMU anlatır:
  // turuncu = "yakında kapanıyor" (tasarım ekranı 05). Seçili diye turuncuya
  // boyamak iki ayrı anlamı birbirine karıştırır.
  const size = selected ? 60 : p.status === 'closed' ? 34 : 52;
  const warn = p.status === 'closing_soon';
  const bg = warn ? 'var(--warn)' : p.status === 'closed' ? 'var(--text-dim)' : 'var(--brand)';
  const fg = warn ? 'var(--warn-on)' : 'var(--brand-on)';

  const pin = document.createElement('span');
  pin.style.cssText = `
    background:${bg};width:${size}px;height:${size}px;
    border-radius:${size > 40 ? '18px 18px 18px 6px' : '13px 13px 13px 5px'};
    display:grid;place-items:center;position:relative;
    box-shadow:${warn ? 'var(--sh-pin-sel)' : 'var(--sh-pin)'};
    outline:${selected ? '3px solid var(--bg)' : 'none'};outline-offset:2px;
    opacity:${p.status === 'closed' ? 0.55 : 1};`;

  // Eczane haçı
  const h = document.createElement('span');
  h.style.cssText = `position:absolute;width:${size * 0.46}px;height:${size * 0.155}px;background:${fg};border-radius:2px`;
  const v = document.createElement('span');
  v.style.cssText = `position:absolute;width:${size * 0.155}px;height:${size * 0.46}px;background:${fg};border-radius:2px`;
  pin.append(h, v);
  wrap.append(pin);

  if (p.distanceM !== null) {
    const chip = document.createElement('span');
    chip.className = 'tnum';
    chip.textContent =
      p.distanceM < 1000 ? `${p.distanceM} m` : `${(p.distanceM / 1000).toFixed(1)} km`;
    chip.style.cssText = `background:${bg};color:${fg};font-family:var(--font-display);
      font-size:12px;font-weight:800;padding:3px 8px;border-radius:var(--r-chip)`;
    wrap.append(chip);
  }

  return wrap;
}

export default function MapView({ items, user, city, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<MlMarker[]>([]);
  const userMarker = useRef<MlMarker | null>(null);

  // Harita bir kere kurulur.
  useEffect(() => {
    if (!container.current || map.current || !STYLE_URL) return;

    const initialCenter: [number, number] =
      user?.lng && user?.lat
        ? [user.lng, user.lat]
        : city?.lng && city?.lat
          ? [city.lng, city.lat]
          : [DEFAULT_LNG, DEFAULT_LAT];

    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    // Sheet ekranın altını kapladığı için harita merkezini yukarı kaydır.
    // `padding` MapOptions'ta değil; harita hazır olunca uygulanır.
    m.on('load', () => m.setPadding({ top: 0, bottom: 260, left: 0, right: 0 }));
    // Harita SESSİZCE çuvallamamalı: stil, karo veya worker hatası ana iş
    // parçacığında hiçbir iz bırakmadan boş bir zemine dönüşüyor. Hata yüzeye
    // çıkarılır ki teşhis edilebilsin.
    m.on('error', (e) => {
      const err = (e as { error?: unknown }).error;
      console.error('[harita]', err instanceof Error ? err.message : err, e);
    });

    map.current = m;
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: unknown }).__map = m;
    }

    return () => {
      m.remove();
      map.current = null;
    };
    // user yalnızca ilk merkezleme için okunur; sonraki değişimler ayrı efektte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kullanıcı noktası
  useEffect(() => {
    const m = map.current;
    if (!m || !user) return;

    let marker = userMarker.current;
    if (!marker) {
      const el = document.createElement('div');
      el.setAttribute('aria-label', 'Senin konumun');
      el.style.cssText = `width:20px;height:20px;border-radius:50%;background:var(--user-dot);
        border:3px solid var(--bg);box-shadow:0 0 0 3px var(--user-halo)`;
      marker = new maplibregl.Marker({ element: el });
      userMarker.current = marker;
    }
    marker.setLngLat([user.lng, user.lat]).addTo(m);
    m.easeTo({ center: [user.lng, user.lat], duration: 600 });
  }, [user]);

  // Eczane pinleri ve harita kamerasının odaklanması
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    for (const mk of markers.current) mk.remove();
    markers.current = [];

    const validItems: Pharmacy[] = [];
    for (const p of items) {
      // Koordinatı olmayan eczane haritada gösterilemez (ADR-005) — listede var,
      // pinde yok. Sessizce atlanır, hata değil.
      if (p.lat === null || p.lng === null) continue;
      validItems.push(p);
      const el = pinElement(p, p.id === selectedId);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(p);
      });
      markers.current.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m),
      );
    }

    // Kamera odaklanması: Seçili eczane varsa ona git; yoksa listedeki eczaneleri kadraja al.
    const selected = validItems.find((p) => p.id === selectedId);
    if (selected && selected.lat !== null && selected.lng !== null) {
      m.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 600 });
    } else if (validItems.length === 1) {
      m.flyTo({ center: [validItems[0]!.lng!, validItems[0]!.lat!], zoom: 14, duration: 600 });
    } else if (validItems.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of validItems) bounds.extend([p.lng!, p.lat!]);
      m.fitBounds(bounds, {
        padding: { top: 80, bottom: 280, left: 40, right: 40 },
        maxZoom: 15,
        duration: 600,
      });
    } else if (city?.lat && city?.lng) {
      m.flyTo({ center: [city.lng, city.lat], zoom: 11, duration: 600 });
    }

    return () => {
      for (const mk of markers.current) mk.remove();
      markers.current = [];
    };
  }, [items, selectedId, onSelect, city]);

  // Anahtar yoksa harita yerine tasarımdaki doku kalır; liste çalışmaya devam eder.
  if (!STYLE_URL) return null;

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />;
}
