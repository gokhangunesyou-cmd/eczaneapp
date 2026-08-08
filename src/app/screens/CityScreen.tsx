import { useEffect, useState } from 'react';
import { getCities, ApiClientError, type City } from '@app/lib/api';

/**
 * İl seçimi (ADR-006).
 *
 * Kapsam 81 ile açıldı; konum çözülemediğinde ya da kullanıcı ili elle
 * değiştirmek istediğinde bu ekran gelir. Düzen ilçe ekranıyla (tasarım 06)
 * birebir aynı — yeni bir tasarım dili üretilmedi, aynı liste kalıbı.
 *
 * Bu bir HATA EKRANI DEĞİLDİR.
 */
export function CityScreen({
  title,
  onPick,
  onBack,
  backLabel,
}: {
  title: string;
  onPick: (code: number, name: string) => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [items, setItems] = useState<City[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    getCities()
      .then((r) => alive && setItems(r.items))
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiClientError ? e.message : 'İl listesi yüklenemedi.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = items?.filter((c) =>
    c.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')),
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
          {title}
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--text-3)' }}>
          81 il · listeyi hemen getiririm
        </p>
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
          placeholder="İl ara"
          aria-label="İl ara"
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
          {error && (
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
              {error}
            </div>
          )}

          {!items && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-12)' }}>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="skeleton" style={{ height: 44 }} />
              ))}
            </div>
          )}

          {filtered?.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 15, padding: 'var(--s-16) 0' }}>
              Bu adda bir il bulamadım.
            </p>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered?.map((c) => (
              <li key={c.code}>
                <button
                  onClick={() => onPick(c.code, c.name)}
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
                  {c.name}
                  {/* Verisi hiç çekilmemiş il sessizce boş liste göstermesin;
                      seçmeden önce söylenir. */}
                  {c.districtCount === 0 && (
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        fontWeight: 400,
                        color: 'var(--border-strong)',
                      }}
                    >
                      veri yok
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {onBack && (
        <div
          style={{
            padding: 'var(--s-16) var(--s-22) var(--s-40)',
            background: 'linear-gradient(to top, var(--bg-alt) 62%, transparent)',
          }}
        >
          <button
            onClick={onBack}
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
            {backLabel ?? 'Vazgeç'}
          </button>
        </div>
      )}
    </div>
  );
}
