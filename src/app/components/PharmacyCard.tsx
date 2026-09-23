import type { Pharmacy } from '@app/lib/api';
import { formatDistance } from '@shared/geo';
import { formatTrTime } from '@shared/duty';
import { openDirections, callPhone, copyText } from '@app/lib/directions';
import { slugify } from '@shared/slug';
import { useState } from 'react';

/**
 * Birincil eczane kartı — tasarım ekranı 03/04/05/07.
 *
 * `closing_soon` durumunda kartın TAMAMI turuncu varyanta geçer (zemin, kenarlık,
 * butonlar). Çevrimdışında birincil aksiyon "Ara" olur — bayat veriyle
 * navigasyona göndermek yanlış olur.
 */
export function PharmacyCard({
  item,
  offline,
  onOpenProfile,
  citySlug,
}: {
  item: Pharmacy;
  offline?: boolean | undefined;
  onOpenProfile?: ((pharmacy: Pharmacy) => void) | undefined;
  citySlug?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const warn = item.status === 'closing_soon';
  const hasCoords = item.lat !== null && item.lng !== null;

  const accent = warn ? 'var(--warn)' : 'var(--brand)';
  const accentOn = warn ? 'var(--warn-on)' : 'var(--brand-on)';
  const accentFg = warn ? 'var(--warn-fg)' : 'var(--brand)';

  const handleDirectionsClick = () => {
    if (!hasCoords) return;
    openDirections(item.lat!, item.lng!, item.name);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cSlug = citySlug || 'antalya';
    const dSlug = slugify(item.districtName);
    const pKey = slugify(item.name).replace(/-eczane(si)?$/, '');
    const path = `/${cSlug}-${dSlug}-${pKey}-eczanesi`;
    const shareUrl = `${window.location.origin}${path}`;

    if (navigator.share) {
      navigator.share({
        title: `${item.name} Nöbetçi Eczanesi`,
        text: `${item.name} Nöbetçi Eczanesi - ${item.address} (${item.districtName})`,
        url: shareUrl,
      }).catch(() => {
        void copyText(shareUrl).then((ok) => {
          if (ok) {
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
          }
        });
      });
    } else {
      void copyText(shareUrl).then((ok) => {
        if (ok) {
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2000);
        }
      });
    }
  };

  return (
    <article
      style={{
        border: `1px solid ${warn ? 'var(--warn-border)' : 'var(--border-2)'}`,
        background: warn ? 'var(--warn-surface)' : 'var(--surface-2)',
        borderRadius: 'var(--r-card)',
        padding: 'var(--s-18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-12)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-12)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)', minWidth: 0, flex: 1 }}>
          <h2
            onClick={() => onOpenProfile?.(item)}
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              cursor: onOpenProfile ? 'pointer' : 'default',
            }}
          >
            {item.name}
          </h2>

          {item.distanceM !== null && (
            <div className="tnum" style={{ fontSize: 14, color: 'var(--text-2)' }}>
              {formatDistance(item.distanceM)}
              {item.etaMin !== null && ` · ~${item.etaMin} dk araçla`}
            </div>
          )}

          <address
            style={{
              fontStyle: 'normal',
              fontSize: 13,
              color: 'var(--text-3)',
              lineHeight: 1.45,
            }}
          >
            {item.address} · {item.districtName}
          </address>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleShareClick}
            title={shareCopied ? 'Bağlantı kopyalandı' : 'Eczaneyi paylaş'}
            aria-label="Eczaneyi paylaş"
            style={{
              background: shareCopied ? 'var(--brand-soft-bg)' : 'var(--surface-3)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--r-icon)',
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: shareCopied ? 'var(--brand-soft-fg)' : 'var(--text-1)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
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
              {shareCopied ? (
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
            <span>{shareCopied ? 'Kopyalandı' : 'Paylaş'}</span>
          </button>
        </div>
      </div>

      <StatusBadge item={item} offline={offline} />

      <div style={{ display: 'flex', gap: 'var(--s-12)' }}>
        {offline ? (
          <>
            <button
              className="tnum"
              disabled={!item.phone}
              onClick={() => item.phone && callPhone(item.phone)}
              style={{
                flex: 1.25,
                height: 54,
                borderRadius: 'var(--r-btn)',
                background: 'var(--brand)',
                color: 'var(--brand-on)',
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 800,
                border: 'none',
                opacity: item.phone ? 1 : 0.5,
              }}
            >
              Ara
            </button>
            <button
              onClick={() => {
                void copyText(`${item.name} — ${item.address}`).then(setCopied);
              }}
              style={{
                flex: 1,
                height: 54,
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border-3)',
                background: 'transparent',
                color: 'var(--text-3)',
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Kopyalandı' : 'Adresi Kopyala'}
            </button>
          </>
        ) : (
          <>
            <button
              disabled={!hasCoords}
              title={hasCoords ? undefined : 'Bu eczanenin konumu henüz kayıtlı değil'}
              onClick={handleDirectionsClick}
              style={{
                flex: 1.25,
                opacity: hasCoords ? 1 : 0.5,
                height: 54,
                borderRadius: 'var(--r-btn)',
                background: accent,
                color: accentOn,
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 800,
                border: 'none',
                cursor: hasCoords ? 'pointer' : 'not-allowed',
              }}
            >
              Yol Tarifi
            </button>
            <button
              disabled={!item.phone}
              onClick={() => item.phone && callPhone(item.phone)}
              style={{
                flex: 1,
                height: 54,
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${accent}`,
                background: 'transparent',
                color: accentFg,
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 800,
                opacity: item.phone ? 1 : 0.5,
                cursor: item.phone ? 'pointer' : 'not-allowed',
              }}
            >
              Ara
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ item, offline }: { item: Pharmacy; offline?: boolean | undefined }) {
  if (offline) {
    return (
      <Badge bg="var(--surface-3)" fg="var(--text-4)">
        Kayıtlı bilgi
      </Badge>
    );
  }

  if (item.status === 'closed') {
    return (
      <Badge bg="var(--surface-3)" fg="var(--danger)">
        Nöbeti bitti
      </Badge>
    );
  }

  if (item.status === 'closing_soon') {
    return (
      <Badge bg="var(--warn-soft-bg)" fg="var(--warn-fg)" dot="var(--warn)">
        {item.minutesUntilClose} dakika sonra kapanıyor
      </Badge>
    );
  }

  return (
    <Badge bg="var(--brand-soft-bg)" fg="var(--brand-soft-fg)" dot="var(--brand)">
      Sabah {formatTrTime(item.dutyEnd)}&apos;a kadar açık
    </Badge>
  );
}

function Badge({
  children,
  bg,
  fg,
  dot,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
  dot?: string;
}) {
  return (
    <div
      className="tnum"
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-8)',
        background: bg,
        color: fg,
        borderRadius: 'var(--r-badge)',
        padding: '7px 12px',
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {dot && (
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
      )}
      {children}
    </div>
  );
}
