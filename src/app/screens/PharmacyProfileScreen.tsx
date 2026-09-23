import { useEffect, useState } from 'react';
import type { Pharmacy } from '@app/lib/api';
import { getOnDuty } from '@app/lib/api';
import { SeoHead } from '@app/components/SeoHead';
import { openDirections, callPhone, copyText } from '@app/lib/directions';
import { formatTrDate, formatTrTime } from '@shared/duty';
import { slugify } from '@shared/slug';

type Props = {
  citySlug: string;
  districtSlug: string;
  pharmacyKey: string;
  onBack: () => void;
};

export function PharmacyProfileScreen({ citySlug, districtSlug, pharmacyKey, onBack }: Props) {
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;

    getOnDuty({ includeExpired: true, limit: 100 })
      .then((res) => {
        if (!alive) return;
        const found = res.items.find((p) => {
          const key = slugify(p.name).replace(/-eczane(si)?$/, '');
          return key === pharmacyKey || slugify(p.name) === pharmacyKey;
        });

        if (found) {
          setPharmacy(found);
        } else {
          setError('Aradığınız eczane bulunamadı veya bugün nöbetçi değil.');
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('Eczane bilgileri yüklenirken bir hata oluştu.');
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [pharmacyKey]);

  const BASE_URL = 'https://nobetcieczane.becayisler.com';
  const canonicalUrl = `${BASE_URL}/${citySlug}-${districtSlug}-${pharmacyKey}-eczanesi`;

  const pharmacyName = pharmacy
    ? pharmacy.name.endsWith('Eczanesi')
      ? pharmacy.name
      : `${pharmacy.name} Eczanesi`
    : 'Nöbetçi Eczane';

  const cityName = pharmacy ? pharmacy.districtName : citySlug;
  const pageTitle = `${pharmacyName} — ${cityName} Nöbetçi Eczane`;
  const pageDesc = `${pharmacyName} güncel nöbetçi eczane adresi: ${pharmacy?.address ?? ''}. Telefon numarası, çalışma saatleri ve harita konumu.`;

  const handleDirectionsClick = () => {
    if (!pharmacy || pharmacy.lat === null || pharmacy.lng === null) return;
    openDirections(pharmacy.lat, pharmacy.lng, pharmacy.name);
  };

  return (
    <div className="screen" style={{ background: 'var(--bg)', overflowY: 'auto' }}>
      <SeoHead
        title={pageTitle}
        description={pageDesc}
        canonicalUrl={canonicalUrl}
        pharmacies={pharmacy ? [pharmacy] : undefined}
        breadcrumbs={[
          { name: 'Ana Sayfa', url: `${BASE_URL}/` },
          {
            name: `${citySlug.toUpperCase()} Nöbetçi Eczaneleri`,
            url: `${BASE_URL}/${citySlug}-nobetci-eczane`,
          },
          { name: pharmacyName, url: canonicalUrl },
        ]}
      />

      <header
        style={{
          padding: 'calc(env(safe-area-inset-top, 0px) + var(--s-16)) var(--s-22) var(--s-14)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-12)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Geri dön"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 'var(--r-icon)',
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-1)',
            cursor: 'pointer',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pharmacyName}
          </h1>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Nöbetçi Eczane Profili</span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: pageTitle,
                text: pageDesc,
                url: canonicalUrl,
              }).catch(() => {
                void copyText(canonicalUrl).then(setCopied);
              });
            } else {
              void copyText(canonicalUrl).then(setCopied);
            }
          }}
          title={copied ? 'Bağlantı kopyalandı' : 'Eczane sayfasını paylaş'}
          aria-label="Eczane sayfasını paylaş"
          style={{
            background: copied ? 'var(--brand-soft-bg)' : 'var(--surface-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 'var(--r-icon)',
            padding: '8px 12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: copied ? 'var(--brand-soft-fg)' : 'var(--text-1)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {copied ? (
              <path d="M20 6L9 17l-5-5" />
            ) : (
              <>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </>
            )}
          </svg>
          <span>{copied ? 'Kopyalandı' : 'Paylaş'}</span>
        </button>
      </header>

      <main
        style={{
          padding: 'var(--s-22)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-18)',
        }}
      >
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-14)' }}>
            <div className="skeleton" style={{ height: 180, borderRadius: 'var(--r-card)' }} />
            <div className="skeleton" style={{ height: 60, borderRadius: 'var(--r-btn)' }} />
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--warn-soft-bg)',
              border: '1px solid var(--warn-border)',
              borderRadius: 16,
              padding: '16px',
              color: 'var(--text-2)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {pharmacy && (
          <>
            <section
              style={{
                border: '1px solid var(--border-2)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-card)',
                padding: 'var(--s-22)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--s-16)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
                <span
                  style={{
                    alignSelf: 'flex-start',
                    background: 'var(--brand-soft-bg)',
                    color: 'var(--brand-soft-fg)',
                    borderRadius: 'var(--r-badge)',
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Sabah {formatTrTime(pharmacy.dutyEnd)}&apos;a kadar nöbetçi
                </span>
                <h2
                  style={{
                    margin: '8px 0 0',
                    fontFamily: 'var(--font-display)',
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  {pharmacyName}
                </h2>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {pharmacy.address} · {pharmacy.districtName}
                </p>
              </div>

              {pharmacy.phone && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px var(--s-16)',
                    background: 'var(--surface-3)',
                    borderRadius: 'var(--r-field)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                    📞 {pharmacy.phone}
                  </span>
                  <button
                    onClick={() => callPhone(pharmacy.phone!)}
                    style={{
                      background: 'var(--brand-soft-bg)',
                      color: 'var(--brand-soft-fg)',
                      border: 'none',
                      borderRadius: 12,
                      padding: '6px 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Hemen Ara
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  void copyText(`${pharmacyName} — ${pharmacy.address}`).then(setCopied);
                }}
                style={{
                  height: 48,
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border-3)',
                  background: 'transparent',
                  color: 'var(--text-2)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Adres kopyalandı!' : 'Adresi Kopyala'}
              </button>
            </section>

            {pharmacy.lat !== null && pharmacy.lng !== null && (
              <button
                onClick={handleDirectionsClick}
                style={{
                  width: '100%',
                  height: 60,
                  borderRadius: 'var(--r-btn-lg)',
                  background: 'var(--brand)',
                  color: 'var(--brand-on)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 17,
                  fontWeight: 800,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--s-8)',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Haritada Yol Tarifi Al
              </button>
            )}

            <div
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 'var(--s-16)',
                fontSize: 13,
                color: 'var(--text-3)',
                lineHeight: 1.5,
              }}
            >
              💡 <strong>Tavsiye:</strong> Yola çıkmadan önce eczaneyi telefonla arayarak ilacın
              stokta olup olmadığını teyit etmenizi öneririz. Nöbet değişim saati{' '}
              {formatTrDate(new Date().toISOString())} sabah 08:00&apos;dir.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
