/**
 * Çekim sekmesi — tetikleme düğmesi ve koşu defteri (ADR-006).
 *
 * Çekim Cloudflare'de koşmaz; düğme GitHub Actions'taki iş akışını başlatır.
 * Bu yüzden sonuç ANINDA GELMEZ ve arayüz bunu açıkça söyler: koşu kayıtları
 * birkaç dakika içinde aşağıdaki tabloya düşer.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminListScrapeRuns,
  adminTriggerScrape,
  ApiClientError,
  type ScrapeRun,
} from '@app/lib/api';
import { ErrorBox, SkeletonRows } from './ui';
import { formatTrDate, formatTrTime } from '@shared/duty';

const OUTCOME_LABEL: Record<ScrapeRun['outcome'], string> = {
  ok: 'tamam',
  partial: 'kısmi',
  error: 'hata',
};

const outcomeColor = (o: ScrapeRun['outcome']) =>
  o === 'ok' ? 'var(--text-3)' : o === 'partial' ? 'var(--warn-fg)' : 'var(--danger)';

export function ScrapeTab({ cityCode, cityName }: { cityCode: number; cityName: string }) {
  const [runs, setRuns] = useState<ScrapeRun[] | null>(null);
  const [scope, setScope] = useState<'tum' | 'il'>('tum');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    adminListScrapeRuns({ limit: 50 })
      .then((r) => alive && setRuns(r.items))
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiClientError ? e.message : 'Koşu kayıtları yüklenemedi.');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const trigger = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await adminTriggerScrape(scope === 'tum' ? 'tum' : String(cityCode), 'ikisi');
      setNotice(
        'Çekim başlatıldı. Sonuç birkaç dakika sürer; bittiğinde aşağıdaki listede görünür.',
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Çekim başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-16)' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-12)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-card)',
          padding: 'var(--s-16)',
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>
          Veri her gün 06:00 ve 12:00&apos;de kendiliğinden çekiliyor. Buradan elle de
          tetikleyebilirsin — kaynağa yüklenmemek için 10 dakikada bir.
        </p>

        <div style={{ display: 'flex', gap: 'var(--s-12)', flexWrap: 'wrap' }}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value === 'tum' ? 'tum' : 'il')}
            aria-label="Çekim kapsamı"
            style={{
              flex: '1 1 200px',
              height: 48,
              border: '1px solid var(--border-3)',
              borderRadius: 'var(--r-icon)',
              background: 'var(--surface)',
              padding: '0 var(--s-14)',
            }}
          >
            <option value="tum">81 il · bugün + yarın</option>
            <option value="il">{cityName} · bugün + yarın</option>
          </select>

          <button
            className="btn-primary"
            style={{ height: 48, padding: '0 var(--s-22)' }}
            disabled={busy}
            onClick={() => void trigger()}
          >
            {busy ? 'Başlatılıyor…' : 'e-Devlet çekimini tetikle'}
          </button>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          style={{
            margin: 0,
            background: 'var(--brand-soft-bg)',
            color: 'var(--brand-soft-fg)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 14,
          }}
        >
          {notice}
        </p>
      )}

      {error && <ErrorBox message={error} />}

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--s-12)',
        }}
      >
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800 }}>
          Son koşular
        </h2>
        <button
          onClick={reload}
          style={{
            height: 40,
            padding: '0 var(--s-14)',
            border: '1px solid var(--border-3)',
            borderRadius: 'var(--r-icon)',
            color: 'var(--text-3)',
            fontSize: 14,
          }}
        >
          Yenile
        </button>
      </div>

      {!runs && <SkeletonRows n={5} />}

      {runs?.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 15 }}>
          Henüz koşu kaydı yok. İlk otomatik çekimden sonra burası dolar.
        </p>
      )}

      {runs && runs.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {runs.map((r) => (
            <li
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-12)',
                borderTop: '1px solid var(--border)',
                padding: '12px 4px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>
                  {r.cityName}
                </span>
                <span className="tnum" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {formatTrDate(r.dutyDate)} nöbeti ·{' '}
                  {r.finishedAt ? formatTrTime(r.finishedAt) : '—'}
                </span>
              </span>

              <span className="tnum" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {r.rowsFound} satır · {r.dutiesWritten} nöbet
                {r.coordsFetched > 0 && ` · +${r.coordsFetched} koordinat`}
              </span>

              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: outcomeColor(r.outcome),
                }}
              >
                {OUTCOME_LABEL[r.outcome]}
              </span>

              {r.errorMessage && (
                <span
                  style={{
                    flexBasis: '100%',
                    fontSize: 13,
                    color: 'var(--danger)',
                    wordBreak: 'break-word',
                  }}
                >
                  {r.errorMessage}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
