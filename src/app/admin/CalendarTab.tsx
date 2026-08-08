/**
 * Aylık nöbet takvimi + seçilen günün listesi.
 *
 * Amaç tek bir soruyu bir bakışta cevaplamak: **hangi gün eksik?** Bu yüzden
 * ızgarada nöbet sayısı ve boş gün işareti var; ayrıntı ancak güne tıklayınca
 * açılıyor. Renk, boşluk ve yuvarlaklık değerleri design/DESIGN-TOKENS.md'den.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminDutyCalendar,
  adminListDuties,
  adminListPharmacies,
  adminCreateDuty,
  adminDeleteDuty,
  ApiClientError,
  type AdminPharmacy,
  type CalendarDay,
  type District,
  type DutyShift,
} from '@app/lib/api';
import { ErrorBox, SkeletonRows } from './ui';
import { dutyDateOf, formatTrDate } from '@shared/duty';

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** Bir günün listede kaç kayıt göstereceği. Tek ilde bu sınıra ulaşılmıyor. */
const PAGE = 200;

const monthOf = (date: string) => date.slice(0, 7);

const partsOf = (month: string) => ({
  year: Number(month.slice(0, 4)),
  month: Number(month.slice(5, 7)),
});

/** `2026-08` → o ayın günleri, pazartesi başlangıçlı ızgara boşluklarıyla. */
function monthGrid(month: string): (string | null)[] {
  const { year: y, month: m } = partsOf(month);
  const first = new Date(Date.UTC(y, m - 1, 1));
  // `Date.UTC(y, m, 0)` = bir sonraki ayın sıfırıncı günü = bu ayın son günü.
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // getUTCDay: 0 = pazar. Izgara pazartesi başlıyor.
  const lead = (first.getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

function shiftMonth(month: string, delta: number): string {
  const { year: y, month: m } = partsOf(month);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function CalendarTab({
  cityCode,
  cityName,
  districts,
}: {
  cityCode: number;
  cityName: string;
  districts: District[];
}) {
  const today = dutyDateOf(new Date());

  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [district, setDistrict] = useState('');

  // Yüklenen veri hangi sorguya ait olduğuyla birlikte tutulur. Efekt içinde
  // "önce null'a çek" yapılmıyor: ay değişince eski sayılar bir kare boyunca
  // yanlış ayda görünürdü ve bu kalıp ardışık render tetikliyor.
  const [loaded, setLoaded] = useState<{ key: string; days: CalendarDay[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const queryKey = `${month}|${cityCode}|${reloadKey}`;
  const days = loaded?.key === queryKey ? loaded.days : null;

  useEffect(() => {
    let alive = true;
    adminDutyCalendar(month, cityCode)
      .then((r) => {
        if (!alive) return;
        setError(null);
        setLoaded({ key: queryKey, days: r.days });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiClientError ? e.message : 'Takvim yüklenemedi.');
      });
    return () => {
      alive = false;
    };
  }, [month, cityCode, queryKey]);

  const countByDate = new Map((days ?? []).map((d) => [d.date, d]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-16)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s-12)',
        }}
      >
        <MonthButton label="Önceki ay" onClick={() => setMonth(shiftMonth(month, -1))}>
          ‹
        </MonthButton>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800 }}>
            {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{cityName}</div>
        </div>

        <MonthButton label="Sonraki ay" onClick={() => setMonth(shiftMonth(month, 1))}>
          ›
        </MonthButton>
      </div>

      {error && <ErrorBox message={error} />}

      <div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 'var(--s-6)',
            marginBottom: 'var(--s-6)',
          }}
        >
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', height: 20 }}
            >
              {w}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--s-6)' }}>
          {monthGrid(month).map((date, i) =>
            date === null ? (
              <div key={`bos-${i}`} />
            ) : (
              <DayCell
                key={date}
                date={date}
                day={countByDate.get(date)}
                loading={days === null}
                isToday={date === today}
                selected={date === selected}
                onPick={() => setSelected(date)}
              />
            ),
          )}
        </div>
      </div>

      <DayDetail
        date={selected}
        cityCode={cityCode}
        district={district}
        districts={districts}
        onDistrictChange={setDistrict}
        onChanged={reload}
      />
    </div>
  );
}

function MonthButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        border: '1px solid var(--border-3)',
        borderRadius: 'var(--r-icon)',
        color: 'var(--text-3)',
        fontSize: 20,
      }}
    >
      {children}
    </button>
  );
}

function DayCell({
  date,
  day,
  loading,
  isToday,
  selected,
  onPick,
}: {
  date: string;
  day: CalendarDay | undefined;
  loading: boolean;
  isToday: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const count = day?.count ?? 0;
  const empty = !loading && count === 0;

  return (
    <button
      onClick={onPick}
      aria-pressed={selected}
      aria-label={`${formatTrDate(date)} — ${loading ? 'yükleniyor' : `${count} nöbetçi`}`}
      style={{
        minHeight: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: 4,
        borderRadius: 'var(--r-icon)',
        border: selected ? '2px solid var(--brand)' : '1px solid var(--border)',
        // Boş gün uyarı rengiyle işaretlenir: "bu gün için veri yok" ürünün
        // en pahalı hatası, ızgarada saklanmamalı.
        background: empty ? 'var(--warn-soft-bg)' : 'var(--surface-2)',
        color: 'var(--text)',
      }}
    >
      <span
        className="tnum"
        style={{
          fontSize: 15,
          fontWeight: isToday ? 800 : 500,
          color: isToday ? 'var(--brand)' : 'var(--text)',
        }}
      >
        {Number(date.slice(8, 10))}
      </span>

      {loading ? (
        <span className="skeleton" style={{ width: 22, height: 12, borderRadius: 6 }} />
      ) : (
        <span
          className="tnum"
          style={{ fontSize: 12, color: empty ? 'var(--warn-fg)' : 'var(--text-3)' }}
        >
          {empty ? '—' : count}
        </span>
      )}

      {/* Elle eklenmiş nöbet varsa nokta ile belirtilir; kaynak karışımı görünür olsun. */}
      {!loading && (day?.manualCount ?? 0) > 0 && (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--brand)',
          }}
        />
      )}
    </button>
  );
}

// ─── Seçilen günün listesi ──────────────────────────────────────────────────

function DayDetail({
  date,
  cityCode,
  district,
  districts,
  onDistrictChange,
  onChanged,
}: {
  date: string;
  cityCode: number;
  district: string;
  districts: District[];
  onDistrictChange: (code: string) => void;
  onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    key: string;
    duties: DutyShift[];
    total: number;
    pharmacies: AdminPharmacy[];
  } | null>(null);
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const queryKey = `${date}|${cityCode}|${district}|${reloadKey}`;
  const fresh = loaded?.key === queryKey ? loaded : null;
  const duties = fresh?.duties ?? null;
  const total = fresh?.total ?? 0;
  const pharmacies = fresh?.pharmacies ?? [];

  useEffect(() => {
    let alive = true;

    Promise.all([
      adminListDuties({
        date,
        city: cityCode,
        ...(district ? { district } : {}),
        limit: PAGE,
      }),
      adminListPharmacies({ city: cityCode, limit: PAGE }),
    ])
      .then(([d, p]) => {
        if (!alive) return;
        setError(null);
        setLoaded({ key: queryKey, duties: d.items, total: d.total, pharmacies: p.items });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiClientError ? e.message : 'Yüklenemedi.');
      });

    return () => {
      alive = false;
    };
  }, [date, cityCode, district, queryKey]);

  const assigned = new Set(duties?.map((d) => d.pharmacyId));
  const available = pharmacies.filter((p) => !assigned.has(p.id));

  const add = async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await adminCreateDuty(Number(pick), date);
      setPick('');
      reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError(null);
    try {
      await adminDeleteDuty(id);
      reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Silinemedi.');
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-14)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--s-12)',
          borderTop: '1px solid var(--border)',
          paddingTop: 'var(--s-16)',
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 800,
          }}
        >
          {formatTrDate(date)}
        </h2>
        <span className="tnum" style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {duties === null ? '…' : `${total} nöbetçi`} · 08:00 → ertesi gün 08:00
        </span>
      </header>

      <select
        value={district}
        onChange={(e) => onDistrictChange(e.target.value)}
        aria-label="İlçeye göre süz"
        style={{
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

      {duties?.length === 0 && (
        <div
          role="status"
          style={{
            background: 'var(--warn-soft-bg)',
            border: '1px solid var(--warn-border)',
            borderRadius: 16,
            padding: '12px var(--s-16)',
            fontSize: 14,
            color: 'var(--warn-fg)',
          }}
        >
          Bu gün için nöbet kaydı yok. Kullanıcılar &ldquo;bugünün nöbeti henüz girilmemiş&rdquo;
          uyarısı görüyor. Çekim sekmesinden tetikleyebilir ya da aşağıdan elle ekleyebilirsin.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--s-12)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-card)',
          padding: 'var(--s-16)',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Nöbete eklenecek eczane"
          style={{
            flex: '1 1 240px',
            height: 48,
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-icon)',
            background: 'var(--surface)',
            padding: '0 var(--s-14)',
          }}
        >
          <option value="">Eczane seç…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.districtName}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          style={{ height: 48, padding: '0 var(--s-22)' }}
          disabled={!pick || busy}
          onClick={() => void add()}
        >
          Nöbete ekle
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {!duties && <SkeletonRows n={4} />}

      {duties && duties.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {duties.map((d) => (
            <li
              key={d.id}
              style={{
                minHeight: 64,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-14)',
                borderTop: '1px solid var(--border)',
                padding: '14px 4px',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {d.pharmacyName}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{d.districtName}</span>
              </span>
              <button
                onClick={() => void remove(d.id)}
                style={{
                  height: 40,
                  padding: '0 var(--s-14)',
                  border: '1px solid var(--border-3)',
                  borderRadius: 'var(--r-icon)',
                  color: 'var(--danger)',
                  fontSize: 14,
                }}
              >
                Kaldır
              </button>
            </li>
          ))}
        </ul>
      )}

      {duties && total > duties.length && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>
          İlk {duties.length} kayıt gösteriliyor. Daraltmak için ilçe seç.
        </p>
      )}
    </section>
  );
}
