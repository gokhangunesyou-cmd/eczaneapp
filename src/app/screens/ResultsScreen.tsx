import { Suspense, lazy, useEffect, useState, useCallback } from 'react';
import { getOnDuty, ApiClientError, type Pharmacy, type PharmacyList } from '@app/lib/api';
import { PharmacyCard } from '@app/components/PharmacyCard';
import { PharmacyList as ListView } from '@app/components/PharmacyList';
import { BottomSheet, type SheetStage } from '@app/components/BottomSheet';
import { SheetSkeleton, MapPlaceholder } from '@app/components/Skeleton';
import { formatTrDate, formatTrTime } from '@shared/duty';

// MapLibre ayrı chunk — ilk boyanma haritayı beklemez (ADR-002).
const MapView = lazy(() => import('@app/components/MapView'));

type Props = {
  user?: { lat: number; lng: number };
  city?: { code: number; name: string };
  district?: { code: string; name: string };
  onChangeDistrict: () => void;
  onChangeCity: () => void;
};

export function ResultsScreen({ user, city, district, onChangeDistrict, onChangeCity }: Props) {
  const [data, setData] = useState<PharmacyList | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [selected, setSelected] = useState<Pharmacy | null>(null);
  const [stage, setStage] = useState<SheetStage>('peek');

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;

    getOnDuty({
      // İlçe verilmişse konum gönderilmez (API kuralı: konum ve ilçe birlikte verilemez).
      ...(user && !district ? { lat: user.lat, lng: user.lng } : {}),
      // İl verilmezse sunucu konumdan çözer (ADR-006); elle seçim onu ezer.
      ...(city ? { city: city.code } : {}),
      ...(district ? { district: district.code } : {}),
      includeExpired: true,
      limit: 30,
    })
      .then((d) => {
        if (!alive) return;
        setError(null);
        setData(d);
        setSelected(d.items.find((p) => p.status !== 'closed') ?? d.items[0] ?? null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(
          e instanceof ApiClientError
            ? e
            : new ApiClientError(0, 'internal', 'Bir şeyler ters gitti.'),
        );
      });

    return () => {
      alive = false;
    };
  }, [user, city, district, reloadKey]);

  const offline = error?.code === 'offline';

  // ─── Hata: bağlantı yok ──────────────────────────────────────────────────
  if (offline && !data) {
    return <OfflineScreen onRetry={reload} />;
  }

  // ─── Hata: diğer ─────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div
        className="screen"
        style={{ justifyContent: 'center', padding: 'var(--s-22)', gap: 'var(--s-18)' }}
      >
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, margin: 0 }}>
          {error.message}
        </h1>
        <button className="btn-primary" onClick={reload}>
          Tekrar dene
        </button>
        <button className="btn-ghost" onClick={onChangeDistrict}>
          İlçemi kendim seçeyim
        </button>
      </div>
    );
  }

  const open = data?.items.filter((p) => p.status !== 'closed') ?? [];
  const others = data ? data.items.filter((p) => p.id !== selected?.id) : [];

  return (
    <div
      style={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <MapPlaceholder shimmer={!data} />

      {data && (
        <Suspense fallback={null}>
          <MapView
            items={data.items.filter((p) => p.status !== 'closed')}
            {...(user ? { user } : {})}
            {...(selected ? { selectedId: selected.id } : {})}
            onSelect={(p) => {
              setSelected(p);
              setStage('peek');
            }}
          />
        </Suspense>
      )}

      <header
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + var(--s-16))',
          left: 'var(--s-22)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          nöbetçi
        </span>
        <span className="tnum" style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {data ? `${formatTrDate(data.nextRotationAt)}'a kadar` : '…'}
          {city && ` · ${city.name}`}
          {district && ` · ${district.name}`}
        </span>
      </header>

      {data?.stale && <StaleBanner dataAsOf={data.dataAsOf} />}

      <BottomSheet stage={stage} onStageChange={setStage}>
        {!data && <SheetSkeleton />}

        {data && data.items.length === 0 && (
          <EmptyState district={district?.name} onChangeDistrict={onChangeDistrict} />
        )}

        {selected && <PharmacyCard item={selected} offline={data?.stale} />}

        {stage !== 'peek' && (
          <ListView
            items={others}
            {...(selected ? { selectedId: selected.id } : {})}
            onSelect={setSelected}
          />
        )}

        {stage === 'full' && (
          <>
            <button
              className="btn-ghost"
              style={{ height: 56, marginTop: 'var(--s-14)' }}
              onClick={onChangeDistrict}
            >
              İlçe değiştir{district ? ` · ${district.name}` : ''}
            </button>
            <button className="btn-ghost" style={{ height: 56 }} onClick={onChangeCity}>
              İl değiştir{city ? ` · ${city.name}` : ''}
            </button>
          </>
        )}

        {data && open.length === 0 && data.items.length > 0 && (
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
            Şu an açık nöbetçi eczane görünmüyor. Yola çıkmadan telefonla teyit et.
          </p>
        )}
      </BottomSheet>
    </div>
  );
}

/** Tasarım ekranı 07 — bağlantı yok, son bilinen liste. */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="screen">
      <div
        role="alert"
        style={{
          margin: 'var(--s-18) var(--s-18) 0',
          background: 'var(--warn-soft-bg)',
          border: '1px solid var(--warn-border)',
          borderRadius: 16,
          padding: '14px var(--s-16)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <strong
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 800,
            color: 'var(--warn-fg)',
          }}
        >
          Bağlantı yok
        </strong>
        <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
          Kayıtlı bir liste bulamadım. Bağlantın gelince tekrar deneyeceğim.
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: 'var(--s-16) var(--s-18) var(--s-40)' }}>
        <button className="btn-primary" style={{ width: '100%' }} onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    </div>
  );
}

function StaleBanner({ dataAsOf }: { dataAsOf: string | null }) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top, 0px) + 96px)',
        left: 'var(--s-18)',
        right: 'var(--s-18)',
        background: 'var(--warn-soft-bg)',
        border: '1px solid var(--warn-border)',
        borderRadius: 16,
        padding: '12px var(--s-16)',
        fontSize: 13,
        color: 'var(--text-2)',
        lineHeight: 1.45,
        backdropFilter: 'blur(8px)',
      }}
    >
      <strong style={{ color: 'var(--warn-fg)' }}>Bugünün nöbeti henüz girilmemiş.</strong>{' '}
      {dataAsOf ? `${formatTrDate(dataAsOf)} ${formatTrTime(dataAsOf)}'de` : 'Daha önce'}{' '}
      kaydettiğim listeyi gösteriyorum. Yola çıkmadan telefonla teyit et.
    </div>
  );
}

function EmptyState({
  district,
  onChangeDistrict,
}: {
  district?: string | undefined;
  onChangeDistrict: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-14)',
        paddingTop: 'var(--s-8)',
      }}
    >
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>
        {district ? `${district} için nöbetçi bulamadım` : 'Yakınında nöbetçi bulamadım'}
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Başka bir ilçeye bakmak ister misin?
      </p>
      <button className="btn-ghost" onClick={onChangeDistrict}>
        İlçe seç
      </button>
    </div>
  );
}
