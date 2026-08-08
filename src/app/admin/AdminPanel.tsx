import { useCallback, useEffect, useState } from 'react';
import {
  adminListPharmacies,
  adminDeletePharmacy,
  adminLogout,
  getCities,
  getDistricts,
  ApiClientError,
  type AdminPharmacy,
  type City,
  type District,
} from '@app/lib/api';
import { PharmacyForm } from './PharmacyForm';
import { CalendarTab } from './CalendarTab';
import { ScrapeTab } from './ScrapeTab';
import { ErrorBox, SkeletonRows } from './ui';

type Tab = 'calendar' | 'pharmacies' | 'scrape';

/** Seçilen il oturumlar arası hatırlanır — panelde en sık yapılan seçim bu. */
const CITY_KEY = 'admin.city';
const DEFAULT_CITY = 7;

function readStoredCity(): number {
  const raw = localStorage.getItem(CITY_KEY);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 81 ? n : DEFAULT_CITY;
}

export function AdminPanel({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('calendar');
  const [cities, setCities] = useState<City[]>([]);
  const [cityCode, setCityCode] = useState<number>(readStoredCity);
  const [districts, setDistricts] = useState<District[]>([]);

  useEffect(() => {
    getCities()
      .then((r) => setCities(r.items))
      .catch(() => setCities([]));
  }, []);

  // İlçeler ile bağlı; il değişince yenilenir. Hata yutulur çünkü ilçe listesi
  // yalnızca bir filtre — yoksa "tüm ilçeler" ile çalışmaya devam edilir.
  useEffect(() => {
    let alive = true;
    getDistricts(cityCode)
      .then((d) => alive && setDistricts(d.items))
      .catch(() => alive && setDistricts([]));
    return () => {
      alive = false;
    };
  }, [cityCode]);

  const pickCity = (code: number) => {
    setCityCode(code);
    localStorage.setItem(CITY_KEY, String(code));
  };

  const cityName = cities.find((c) => c.code === cityCode)?.name ?? `${cityCode}. il`;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-alt)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: 'var(--s-16) var(--s-18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s-12)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            nöbetçi · panel
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{username}</div>
        </div>
        <button
          onClick={() => {
            void adminLogout().finally(onLogout);
          }}
          style={{
            height: 40,
            padding: '0 var(--s-14)',
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-icon)',
            color: 'var(--text-3)',
            fontSize: 14,
          }}
        >
          Çıkış
        </button>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--s-14) var(--s-18) 0' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>İl</span>
          <select
            value={cityCode}
            onChange={(e) => pickCity(Number(e.target.value))}
            style={{
              height: 48,
              border: '1px solid var(--border-3)',
              borderRadius: 'var(--r-icon)',
              background: 'var(--surface-2)',
              padding: '0 var(--s-14)',
            }}
          >
            {cities.length === 0 && <option value={cityCode}>{cityName}</option>}
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
                {c.districtCount === 0 ? ' — veri yok' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav
        style={{
          display: 'flex',
          gap: 'var(--s-8)',
          padding: 'var(--s-14) var(--s-18) 0',
          maxWidth: 760,
          margin: '0 auto',
          flexWrap: 'wrap',
        }}
      >
        <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')}>
          Takvim
        </TabButton>
        <TabButton active={tab === 'pharmacies'} onClick={() => setTab('pharmacies')}>
          Eczaneler
        </TabButton>
        <TabButton active={tab === 'scrape'} onClick={() => setTab('scrape')}>
          Çekim
        </TabButton>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--s-18)' }}>
        {tab === 'calendar' && (
          <CalendarTab cityCode={cityCode} cityName={cityName} districts={districts} />
        )}
        {/* `key`: il değişince sekme sıfırdan kurulur — sayfa numarası, arama ve
            ilçe filtresi önceki ile ait kalmasın. */}
        {tab === 'pharmacies' && (
          <PharmaciesTab key={cityCode} cityCode={cityCode} districts={districts} />
        )}
        {tab === 'scrape' && <ScrapeTab cityCode={cityCode} cityName={cityName} />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        height: 44,
        padding: '0 var(--s-16)',
        borderRadius: 'var(--r-icon)',
        background: active ? 'var(--brand-soft-bg)' : 'transparent',
        color: active ? 'var(--brand-soft-fg)' : 'var(--text-3)',
        fontFamily: 'var(--font-display)',
        fontSize: 15,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

// ─── Eczaneler ──────────────────────────────────────────────────────────────

/** Sayfa boyutu. 81 ilde eczane defteri on binlerce satıra çıkar. */
const PAGE = 50;

function PharmaciesTab({ cityCode, districts }: { cityCode: number; districts: District[] }) {
  const [items, setItems] = useState<AdminPharmacy[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('');
  const [editing, setEditing] = useState<AdminPharmacy | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  // Filtre değişince ilk sayfaya dönülür. Bu, efektle değil DEĞİŞTİREN yerde
  // yapılır — efekt içinde setState ardışık render tetikler.
  const changeQuery = (v: string) => {
    setQuery(v);
    setPage(0);
  };
  const changeDistrict = (v: string) => {
    setDistrict(v);
    setPage(0);
  };

  useEffect(() => {
    let alive = true;
    // Yazarken her tuşta istek atmasın.
    const t = setTimeout(
      () => {
        adminListPharmacies({
          ...(query ? { q: query } : {}),
          city: cityCode,
          ...(district ? { district } : {}),
          limit: PAGE,
          offset: page * PAGE,
        })
          .then((r) => {
            if (!alive) return;
            setItems(r.items);
            setTotal(r.total);
          })
          .catch((e: unknown) => {
            if (!alive) return;
            setError(e instanceof ApiClientError ? e.message : 'Yüklenemedi.');
          });
      },
      query ? 250 : 0,
    );

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, district, cityCode, page, reloadKey]);

  const remove = async (id: number) => {
    setError(null);
    try {
      await adminDeletePharmacy(id);
      setConfirmId(null);
      load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Silinemedi.');
    }
  };

  if (creating || editing) {
    return (
      <PharmacyForm
        editing={editing}
        districts={districts}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-16)' }}>
      <div style={{ display: 'flex', gap: 'var(--s-12)', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder="Ad veya adres ara"
          aria-label="Eczane ara"
          style={{
            flex: '1 1 220px',
            height: 48,
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-icon)',
            background: 'var(--surface-2)',
            padding: '0 var(--s-14)',
          }}
        />
        <select
          value={district}
          onChange={(e) => changeDistrict(e.target.value)}
          aria-label="İlçeye göre süz"
          style={{
            flex: '1 1 160px',
            height: 48,
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-icon)',
            background: 'var(--surface-2)',
            padding: '0 var(--s-14)',
          }}
        >
          <option value="">Tüm ilçeler</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          style={{ height: 48, padding: '0 var(--s-22)' }}
          onClick={() => setCreating(true)}
        >
          Yeni eczane
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {!items && <SkeletonRows n={5} />}

      {items?.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 15 }}>
          {query || district ? 'Bu filtreye uyan eczane yok.' : 'Bu ilde henüz eczane yok.'}
        </p>
      )}

      {items && items.length > 0 && (
        <p className="tnum" style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>
          {total} kayıt · sayfa {page + 1}/{lastPage + 1}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items?.map((p) => (
          <li
            key={p.id}
            style={{
              minHeight: 64,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-12)',
              borderTop: '1px solid var(--border)',
              padding: '14px 4px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: '1 1 200px', minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {p.name}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {p.districtName} · {p.address}
                {p.lat === null && ' · koordinat yok'}
              </span>
            </span>

            {confirmId === p.id ? (
              <span style={{ display: 'flex', gap: 'var(--s-8)' }}>
                <button
                  onClick={() => void remove(p.id)}
                  style={{
                    height: 40,
                    padding: '0 var(--s-14)',
                    borderRadius: 'var(--r-icon)',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontSize: 14,
                  }}
                >
                  Sil, eminim
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  style={{
                    height: 40,
                    padding: '0 var(--s-14)',
                    border: '1px solid var(--border-3)',
                    borderRadius: 'var(--r-icon)',
                    fontSize: 14,
                  }}
                >
                  Vazgeç
                </button>
              </span>
            ) : (
              <span style={{ display: 'flex', gap: 'var(--s-8)' }}>
                <button
                  onClick={() => setEditing(p)}
                  style={{
                    height: 40,
                    padding: '0 var(--s-14)',
                    border: '1px solid var(--border-3)',
                    borderRadius: 'var(--r-icon)',
                    fontSize: 14,
                  }}
                >
                  Düzenle
                </button>
                <button
                  onClick={() => setConfirmId(p.id)}
                  style={{
                    height: 40,
                    padding: '0 var(--s-14)',
                    border: '1px solid var(--border-3)',
                    borderRadius: 'var(--r-icon)',
                    color: 'var(--danger)',
                    fontSize: 14,
                  }}
                >
                  Sil
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {total > PAGE && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--s-12)',
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              height: 44,
              padding: '0 var(--s-16)',
              border: '1px solid var(--border-3)',
              borderRadius: 'var(--r-icon)',
              color: 'var(--text-3)',
              fontSize: 14,
            }}
          >
            ‹ Önceki
          </button>
          <button
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
            style={{
              height: 44,
              padding: '0 var(--s-16)',
              border: '1px solid var(--border-3)',
              borderRadius: 'var(--r-icon)',
              color: 'var(--text-3)',
              fontSize: 14,
            }}
          >
            Sonraki ›
          </button>
        </div>
      )}
    </div>
  );
}
