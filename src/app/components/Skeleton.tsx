/**
 * Yükleniyor durumu — tasarım ekranı 02.
 *
 * Tek bir spinner YETMEZ. Skeleton gerçek düzenin iskeletini taşır ki veri
 * geldiğinde ekran zıplamasın. Genişlikler tasarımdan: %62 / %40 / %78.
 */
export function SheetSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-18)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-12)',
          color: 'var(--text-4)',
          fontSize: 15,
        }}
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid var(--brand)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        Yakınındaki eczaneler bulunuyor…
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-12)' }}>
        <div className="skeleton" style={{ height: 22, width: '62%' }} />
        <div className="skeleton" style={{ height: 14, width: '40%' }} />
        <div className="skeleton" style={{ height: 14, width: '78%' }} />
        <div style={{ display: 'flex', gap: 'var(--s-12)', marginTop: 'var(--s-6)' }}>
          <div className="skeleton" style={{ flex: 1.25, height: 56, borderRadius: 18 }} />
          <div className="skeleton" style={{ flex: 1, height: 56, borderRadius: 18 }} />
        </div>
      </div>
    </div>
  );
}

/** Harita yüklenmeden önceki zemin dokusu — tasarımın gradient katmanı. */
export function MapPlaceholder({ shimmer = false }: { shimmer?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(circle at 46% 34%, #131C24, #0B1015 72%),
          repeating-linear-gradient(24deg, transparent 0 46px, #161F27 46px 49px),
          repeating-linear-gradient(114deg, transparent 0 62px, #161F27 62px 65px)`,
        animation: shimmer ? 'shimmer 1.8s ease-in-out infinite' : undefined,
      }}
    />
  );
}
