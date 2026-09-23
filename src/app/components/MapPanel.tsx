import { Suspense, lazy, useState } from 'react';
import type { Pharmacy } from '@app/lib/api';
import { MapPlaceholder } from '@app/components/Skeleton';

const MapView = lazy(() => import('@app/components/MapView'));

type Props = {
  items: Pharmacy[];
  user?: { lat: number; lng: number };
  selectedId?: string;
  onSelect: (p: Pharmacy) => void;
  onFocusUser?: () => void;
  loading?: boolean;
};

export function MapPanel({
  items,
  user,
  selectedId,
  onSelect,
  onFocusUser,
  loading = false,
}: Props) {
  // Harita boyut durumu: normal (varsayılan yan panel), expanded (büyütülmüş), collapsed (küçültülmüş)
  const [mapSize, setMapSize] = useState<'normal' | 'expanded' | 'collapsed'>('normal');

  const toggleSize = () => {
    setMapSize((prev) => (prev === 'normal' ? 'expanded' : prev === 'expanded' ? 'collapsed' : 'normal'));
  };

  return (
    <div className={`map-panel-container size-${mapSize}`}>
      {/* Harita Kontrol Üst Çubuğu */}
      <div className="map-toolbar">
        <div className="map-toolbar-title">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>Nöbetçi Eczane Haritası</span>
        </div>

        <div className="map-toolbar-actions">
          {user && onFocusUser && (
            <button
              onClick={onFocusUser}
              className="map-btn"
              title="Konumuma git"
              aria-label="Konumuma git"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polygon points="12 8 8 16 12 14 16 16 12 8" />
              </svg>
              <span>Konumuma Git</span>
            </button>
          )}

          <button
            onClick={toggleSize}
            className="map-btn map-btn-toggle"
            title={mapSize === 'expanded' ? 'Haritayı Küçült' : 'Haritayı Büyüt'}
            aria-label="Haritayı büyüt veya küçült"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {mapSize === 'expanded' ? (
                <>
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              ) : (
                <>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              )}
            </svg>
            <span>{mapSize === 'expanded' ? 'Küçült' : mapSize === 'collapsed' ? 'Büyüt' : 'Genişlet'}</span>
          </button>
        </div>
      </div>

      {/* Harita Gövdesi */}
      <div className="map-view-body">
        {loading && <MapPlaceholder shimmer />}
        <Suspense fallback={<MapPlaceholder shimmer />}>
          <MapView
            items={items}
            {...(user ? { user } : {})}
            {...(selectedId ? { selectedId } : {})}
            onSelect={onSelect}
          />
        </Suspense>
      </div>
    </div>
  );
}
