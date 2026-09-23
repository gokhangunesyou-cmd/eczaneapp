import { useEffect, useState } from 'react';
import { getDistricts, ApiClientError, type District } from '@app/lib/api';

/**
 * İlçe seçimi — tasarım ekranı 06.
 *
 * Bu bir HATA EKRANI DEĞİLDİR. Konum izni yoksa gidilen alternatif akıştır;
 * kullanıcı suçlanmaz, uyarı gösterilmez.
 */
export function DistrictScreen({
  city,
  title,
  onPick,
  onUseLocation,
  onRetryLocation,
  onChangeCity,
  onBack,
  backLabel,
}: {
  city: { code: number; name: string };
  title?: string;
  onPick: (code: string, name: string) => void;
  onUseLocation?: () => void;
  onRetryLocation?: () => void;
  onChangeCity: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [items, setItems] = useState<District[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    getDistricts(city.code)
      .then((d) => alive && setItems(d.items))
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiClientError ? e.message : 'İlçeler yüklenemedi.');
      });
    return () => {
      alive = false;
    };
  }, [city.code]);

  const filtered = items?.filter((d) =>
    d.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')),
  );

  return (
    <div className="screen">
      <header style={{ padding: '38px var(--s-22) var(--s-18)' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            textWrap: 'pretty',
          }}
        >
          {title ?? 'Nerede olduğunu bulamadım, ilçeni seçer misin?'}
        </h1>
        <button
          onClick={onChangeCity}
          style={{
            margin: '10px 0 0',
            padding: 0,
            fontSize: 14,
            color: 'var(--brand-soft-fg)',
            textAlign: 'left',
            textDecoration: 'underline',
          }}
        >
          {city.name} · ili değiştir
        </button>
      </header>

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '0 var(--s-22)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <button
          onClick={onUseLocation ?? onRetryLocation}
          style={{
            height: 56,
            border: '1px solid var(--brand-soft-bg)',
            borderRadius: 'var(--r-field)',
            background: 'var(--brand-soft-bg)',
            color: 'var(--brand-soft-fg)',
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--s-8)',
            marginBottom: 'var(--s-14)',
            flex: 'none',
            cursor: 'pointer',
          }}
        >
          <svg
            width="18"
            height="18"
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
          Konuma göre (Yakınımdakiler)
        </button>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="İlçe ara"
          aria-label="İlçe ara"
          style={{
            height: 56,
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-field)',
            background: 'transparent',
            padding: '0 var(--s-16)',
            marginBottom: 'var(--s-14)',
            fontSize: 15,
            flex: 'none',
          }}
        />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && <ErrorState message={error} />}

          {!items && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-12)' }}>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="skeleton" style={{ height: 44 }} />
              ))}
            </div>
          )}

          {filtered?.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 15, padding: 'var(--s-16) 0' }}>
              {query
                ? 'Bu adda bir ilçe bulamadım.'
                : `${city.name} için henüz veri yok. Başka bir il seçebilirsin.`}
            </p>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {!query && items && items.length > 0 && (
              <li>
                <button
                  onClick={() => onPick('', `Tüm ${city.name}`)}
                  style={{
                    width: '100%',
                    minHeight: 60,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-strong)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 800,
                    color: 'var(--brand-soft-fg)',
                    textAlign: 'left',
                  }}
                >
                  <span>Tüm {city.name} (İl Geneli)</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>
                    Tüm nöbetçiler
                  </span>
                </button>
              </li>
            )}
            {filtered?.map((d) => (
              <li key={d.code}>
                <button
                  onClick={() => onPick(d.code, d.name)}
                  style={{
                    width: '100%',
                    minHeight: 60,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 700,
                    textAlign: 'left',
                  }}
                >
                  {d.name}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      fontWeight: 400,
                      color: d.onDutyCount > 0 ? 'var(--text-dim)' : 'var(--border-strong)',
                    }}
                  >
                    {d.onDutyCount > 0 ? `${d.onDutyCount} nöbetçi` : 'nöbetçi yok'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        style={{
          padding: 'var(--s-16) var(--s-22) var(--s-40)',
          background: 'linear-gradient(to top, var(--bg-alt) 62%, transparent)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-10)',
        }}
      >
        {onRetryLocation && (
          <button
            onClick={onRetryLocation}
            style={{
              width: '100%',
              height: 52,
              border: '1px solid var(--border-3)',
              borderRadius: 'var(--r-btn)',
              color: 'var(--text-3)',
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Konum iznini tekrar dene
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            style={{
              width: '100%',
              height: 56,
              border: '1px solid var(--border-3)',
              borderRadius: 'var(--r-btn-lg)',
              color: 'var(--brand-soft-fg)',
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            {backLabel ?? 'Vazgeç'}
          </button>
        )}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--warn-soft-bg)',
        border: '1px solid var(--warn-border)',
        borderRadius: 16,
        padding: '14px var(--s-16)',
        color: 'var(--text-2)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {message}
    </div>
  );
}
