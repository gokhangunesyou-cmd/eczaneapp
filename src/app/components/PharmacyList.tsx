import type { Pharmacy } from '@app/lib/api';
import { formatDistance } from '@shared/geo';
import { formatTrTime } from '@shared/duty';

/**
 * "Yakındaki diğer eczaneler" listesi — tasarım ekranı 03 (half/full) ve 04.
 * Nöbeti bitmiş satırlar `opacity: .45` ile soluk gösterilir.
 */
export function PharmacyList({
  items,
  selectedId,
  onSelect,
}: {
  items: Pharmacy[];
  selectedId?: string;
  onSelect: (p: Pharmacy) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          padding: '6px 4px',
        }}
      >
        Yakındaki diğer eczaneler
      </h3>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((p) => {
          const closed = p.status === 'closed';
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p)}
                aria-current={selectedId === p.id ? 'true' : undefined}
                style={{
                  width: '100%',
                  minHeight: 64,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-14)',
                  padding: '14px 4px',
                  borderTop: '1px solid var(--border)',
                  textAlign: 'left',
                  opacity: closed ? 0.45 : 1,
                  background: selectedId === p.id ? 'var(--surface-3)' : 'transparent',
                }}
              >
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    {p.name}
                  </span>
                  <span className="tnum" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {p.distanceM !== null && `${formatDistance(p.distanceM)} · `}
                    {closed
                      ? 'Nöbeti bitti'
                      : p.etaMin !== null
                        ? `~${p.etaMin} dk · ${p.districtName}`
                        : p.districtName}
                  </span>
                </span>

                <span
                  className="tnum"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: closed
                      ? 'var(--danger)'
                      : p.status === 'closing_soon'
                        ? 'var(--warn)'
                        : 'var(--brand-soft-fg)',
                  }}
                >
                  {closed
                    ? 'Kapalı'
                    : p.status === 'closing_soon'
                      ? `${p.minutesUntilClose} dk`
                      : formatTrTime(p.dutyEnd)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
