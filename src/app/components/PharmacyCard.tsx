import type { Pharmacy } from '@app/lib/api';
import { formatDistance } from '@shared/geo';
import { formatTrTime } from '@shared/duty';
import { openDirections, callPhone, copyText } from '@app/lib/directions';
import { useState } from 'react';

/**
 * Birincil eczane kartı — tasarım ekranı 03/04/05/07.
 *
 * `closing_soon` durumunda kartın TAMAMI turuncu varyanta geçer (zemin, kenarlık,
 * butonlar). Çevrimdışında birincil aksiyon "Ara" olur — bayat veriyle
 * navigasyona göndermek yanlış olur.
 */
export function PharmacyCard({ item, offline }: { item: Pharmacy; offline?: boolean | undefined }) {
  const [copied, setCopied] = useState(false);
  const warn = item.status === 'closing_soon';
  // Koordinat yoksa yol tarifi verilemez — düğme kapatılır, kullanıcı
  // "tıkladım bir şey olmadı" durumuna düşmez.
  const hasCoords = item.lat !== null && item.lng !== null;

  const accent = warn ? 'var(--warn)' : 'var(--brand)';
  const accentOn = warn ? 'var(--warn-on)' : 'var(--brand-on)';
  const accentFg = warn ? 'var(--warn-fg)' : 'var(--brand)';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-12)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)', minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
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

        {!offline && hasCoords && (
          <button
            aria-label={`${item.name} için yol tarifi`}
            onClick={() => openDirections(item.lat!, item.lng!, item.name)}
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              borderRadius: 'var(--r-icon)',
              border: `1px solid ${warn ? 'var(--warn-border)' : 'var(--border-3)'}`,
              color: warn ? 'var(--warn-icon)' : 'var(--text-3)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderTop: '2px solid currentColor',
                borderRight: '2px solid currentColor',
                transform: 'rotate(-45deg)',
                marginBottom: 3,
              }}
            />
          </button>
        )}
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
                height: 58,
                borderRadius: 'var(--r-btn)',
                background: 'var(--brand)',
                color: 'var(--brand-on)',
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 800,
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
                height: 58,
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border-3)',
                color: 'var(--text-3)',
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {copied ? 'Kopyalandı' : 'Adresi kopyala'}
            </button>
          </>
        ) : (
          <>
            <button
              disabled={!hasCoords}
              title={hasCoords ? undefined : 'Bu eczanenin konumu henüz kayıtlı değil'}
              onClick={() => hasCoords && openDirections(item.lat!, item.lng!, item.name)}
              style={{
                flex: 1.25,
                opacity: hasCoords ? 1 : 0.5,
                height: 58,
                borderRadius: 'var(--r-btn)',
                background: accent,
                color: accentOn,
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              Yol Tarifi
            </button>
            <button
              disabled={!item.phone}
              onClick={() => item.phone && callPhone(item.phone)}
              style={{
                flex: 1,
                height: 58,
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${accent}`,
                color: accentFg,
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 800,
                opacity: item.phone ? 1 : 0.5,
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
