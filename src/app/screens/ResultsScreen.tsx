import { Suspense, lazy, useEffect, useState, useCallback } from 'react';
import { getOnDuty, ApiClientError, type Pharmacy, type PharmacyList } from '@app/lib/api';
import { PharmacyCard } from '@app/components/PharmacyCard';
import { PharmacyList as ListView } from '@app/components/PharmacyList';
import { BottomSheet, type SheetStage } from '@app/components/BottomSheet';
import { SheetSkeleton, MapPlaceholder } from '@app/components/Skeleton';
import { formatTrDate, formatTrTime } from '@shared/duty';

import { SeoHead } from '@app/components/SeoHead';
import { slugify } from '@shared/slug';

// MapLibre ayrı chunk — ilk boyanma haritayı beklemez (ADR-002).
const MapView = lazy(() => import('@app/components/MapView'));

type Props = {
  user?: { lat: number; lng: number };
  city?: {
    code: number;
    name: string;
    lat?: number | null | undefined;
    lng?: number | null | undefined;
  };
  district?: { code: string; name: string };
  onChangeDistrict: () => void;
  onChangeCity: () => void;
  onUseLocation?: () => void;
  onOpenPharmacyProfile?: (pharmacy: Pharmacy) => void;
};

export function ResultsScreen({
  user,
  city,
  district,
  onChangeDistrict,
  onChangeCity,
  onUseLocation,
  onOpenPharmacyProfile,
}: Props) {
  const [data, setData] = useState<PharmacyList | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [selected, setSelected] = useState<Pharmacy | null>(null);
  const [stage, setStage] = useState<SheetStage>('peek');

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;

    getOnDuty({
      // İl veya ilçe verilmişse konum gönderilmez (farklı ildeki harita/mesafe karışıklığını önler).
      ...(user && !city && !district ? { lat: user.lat, lng: user.lng } : {}),
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
  const others = data
    ? data.items.filter((p) => p.id !== selected?.id && p.status !== 'closed')
    : [];

  const BASE_URL = 'https://nobetci-eczane.becayisler.com';
  const cSlug = city ? slugify(city.name) : undefined;
  const dSlug = district ? slugify(district.name) : undefined;

  let seoTitle = 'Nöbetçi Eczaneler — En Yakın Nöbetçi Eczaneyi Bul';
  let seoDesc =
    'Konumunuza en yakın nöbetçi eczaneyi harita üzerinde anında görün. Harita, telefon ve adres bilgileri ile nöbetçi eczane bulma.';
  let seoCanon = BASE_URL + '/';
  const breadcrumbs = [{ name: 'Ana Sayfa', url: BASE_URL + '/' }];

  if (district && city) {
    seoTitle = `${city.name} ${district.name} Nöbetçi Eczaneleri — Bugün Açık Eczaneler`;
    seoDesc = `${city.name} ${district.name} nöbetçi eczaneleri güncel nöbet listesi, açık eczane adresi, telefon numarası ve harita konumu.`;
    seoCanon = `${BASE_URL}/${cSlug}-${dSlug}-nobetci-eczane`;
    breadcrumbs.push({
      name: `${city.name} Nöbetçi Eczaneleri`,
      url: `${BASE_URL}/${cSlug}-nobetci-eczane`,
    });
    breadcrumbs.push({ name: `${district.name} Nöbetçi Eczaneleri`, url: seoCanon });
  } else if (city) {
    seoTitle = `${city.name} Nöbetçi Eczaneleri — Bugün Açık Eczaneler`;
    seoDesc = `${city.name} nöbetçi eczaneleri güncel nöbet listesi, harita konumu ve telefon bilgileri.`;
    seoCanon = `${BASE_URL}/${cSlug}-nobetci-eczane`;
    breadcrumbs.push({ name: `${city.name} Nöbetçi Eczaneleri`, url: seoCanon });
  }

  return (
    <div
      style={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <SeoHead
        title={seoTitle}
        description={seoDesc}
        canonicalUrl={seoCanon}
        pharmacies={data?.items}
        breadcrumbs={breadcrumbs}
      />

      <MapPlaceholder shimmer={!data} />

      {data && (
        <Suspense fallback={null}>
          <MapView
            items={data.items.filter((p) => p.status !== 'closed')}
            {...(user && !city && !district ? { user } : {})}
            {...(city ? { city } : {})}
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
          right: 'var(--s-22)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 50,
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'auto' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {district ? `${city?.name ?? ''} ${district.name}` : city ? city.name : 'nöbetçi'}
          </h1>
          <span className="tnum" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {data ? `${formatTrDate(data.nextRotationAt)}'a kadar` : '…'}
          </span>
        </div>

        <button
          onClick={() => {
            if (city) {
              onChangeDistrict();
            } else {
              onChangeCity();
            }
          }}
          aria-label="İl ilçe düzenle"
          style={{
            pointerEvents: 'auto',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 20,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--brand-soft-fg)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <svg
            width="14"
            height="14"
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
          <span>
            {district
              ? `${city?.name ?? ''} · ${district.name}`
              : city
                ? city.name
                : 'Konumuna göre'}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </header>

      {data?.stale && <StaleBanner dataAsOf={data.dataAsOf} />}

      <BottomSheet stage={stage} onStageChange={setStage}>
        {!data && <SheetSkeleton />}

        {data && data.items.length === 0 && (
          <EmptyState district={district?.name} onChangeDistrict={onChangeDistrict} />
        )}

        {selected && (
          <PharmacyCard
            item={selected}
            offline={data?.stale}
            onOpenProfile={onOpenPharmacyProfile}
            citySlug={cSlug}
          />
        )}

        {stage !== 'peek' && (
          <ListView
            items={others}
            {...(selected ? { selectedId: selected.id } : {})}
            onSelect={setSelected}
          />
        )}

        {stage === 'full' && (
          <>
            {onUseLocation && (city || district) && (
              <button
                className="btn-ghost"
                style={{ height: 56, marginTop: 'var(--s-14)', color: 'var(--brand-soft-fg)' }}
                onClick={onUseLocation}
              >
                Konuma göre bak
              </button>
            )}
            <button
              className="btn-ghost"
              style={{
                height: 56,
                marginTop: onUseLocation && (city || district) ? 0 : 'var(--s-14)',
              }}
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

        {data && data.items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-3)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px 0' }}>
              Nöbetçi eczane bulunamadı
            </p>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.45 }}>
              Bu bölge için nöbetçi eczane kaydı henüz güncellenmedi veya bulunamadı.
            </p>
          </div>
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
