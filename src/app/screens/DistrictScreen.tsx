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
  onPick,
  onRetryLocation,
  onChangeCity,
}: {
  city: { code: number; name: string };
  onPick: (code: string, name: string) => void;
  onRetryLocation: () => void;
  onChangeCity: () => void;
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
          Nerede olduğunu bulamadım, ilçeni seçer misin?
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
        }}
      >
        <button
          onClick={onRetryLocation}
          style={{
            width: '100%',
            height: 60,
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-btn-lg)',
            color: 'var(--brand-soft-fg)',
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          Konum iznini tekrar dene
        </button>
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
