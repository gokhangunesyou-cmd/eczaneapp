/** Açılış + konum izni — tasarım ekranı 01. */
export function PermissionScreen({
  onAllow,
  onDecline,
  busy,
}: {
  onAllow: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <div className="screen" style={{ justifyContent: 'space-between', position: 'relative' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 34%, rgb(20 192 138 / 0.18), transparent 58%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--s-26)',
          padding: '0 var(--s-40)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 96,
            height: 96,
            borderRadius: 30,
            background: 'var(--brand)',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 30,
              background: 'var(--brand)',
              animation: 'pulse 2.6s ease-out infinite',
            }}
          />
          <span
            style={{
              position: 'relative',
              width: 46,
              height: 14,
              background: 'var(--brand-on)',
              borderRadius: 3,
            }}
          />
          <span
            style={{
              position: 'absolute',
              width: 14,
              height: 46,
              background: 'var(--brand-on)',
              borderRadius: 3,
            }}
          />
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            textWrap: 'balance',
          }}
        >
          Gece açık eczaneyi
          <br />
          hemen göstereyim
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--text-4)',
            maxWidth: 280,
          }}
        >
          Nerede olduğunu bilirsem en yakınını bulurum. Kayıt yok, reklam yok.
        </p>
      </div>

      <div
        style={{
          position: 'relative',
          padding: '0 var(--s-22) var(--s-40)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-14)',
        }}
      >
        <button className="btn-primary" onClick={onAllow} disabled={busy}>
          {busy ? 'Konumun alınıyor…' : 'Konumumu kullan'}
        </button>
        <button className="btn-ghost" onClick={onDecline}>
          {/* Kapsam 81 il oldu (ADR-006): bu düğme artık önce il listesine gidiyor. */}
          Yerimi kendim seçeyim
        </button>
      </div>
    </div>
  );
}
