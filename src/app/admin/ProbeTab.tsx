/**
 * Tanı sekmesi — Worker'ın çıkışından dış adrese istek atar (ADR-007).
 *
 * Var olma sebebi ölçülebilir bir soru: aynı kaynak GitHub Actions'a `403`,
 * geliştirici makinesine `200` veriyor. Cloudflare'in çıkışı üçüncü bir ortam ve
 * tahmin etmek yerine denenebilir olmalı.
 *
 * Ekranın en önemli davranışı ters görünür ama kasıtlıdır: **hedefin 4xx/5xx
 * dönmesi hata değildir.** Tanının başarısı, hedefin ne dediğini öğrenmektir;
 * kırmızı kutu yalnızca isteğin hiç yapılamadığı durumda çıkar.
 *
 * Tasarımda bu ekranın karşılığı yok; panelin kendi kurulu düzeni (ScrapeTab)
 * birebir izlenir, yeni bir görsel dil üretilmez.
 */

import { useState } from 'react';
import { adminProbe, ApiClientError, type ProbeResult } from '@app/lib/api';
import { ErrorBox, Field } from './ui';
import { inputStyle } from './styles';

/** Hazır denemeler — asıl soruyu tek tıkla sormak için. */
const PRESETS: { label: string; url: string }[] = [
  { label: 'e-Devlet', url: 'https://www.turkiye.gov.tr/saglik-titck-nobetci-eczane-sorgulama' },
  { label: 'eczaneler.gen.tr', url: 'https://www.eczaneler.gen.tr/iframe.php?lokasyon=7' },
];

/** Çekimin kaynağa gönderdiği User-Agent — tanı da aynı kimlikle gitsin. */
const SCRAPER_UA =
  'nobetci-eczane/0.1 (+https://nobetci-eczane.becayisler.com; nobetci eczane bilgilendirme servisi)';

export function ProbeTab() {
  const [url, setUrl] = useState(PRESETS[0]!.url);
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [sendUa, setSendUa] = useState(true);
  const [body, setBody] = useState('');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    setFieldError(null);
    setResult(null);
    try {
      setResult(
        await adminProbe({
          url,
          method,
          headers: sendUa ? [{ name: 'User-Agent', value: SCRAPER_UA }] : [],
          body: method === 'POST' && body !== '' ? body : null,
        }),
      );
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        // Alan bazlı hatayı ilgili girdinin altında göster.
        setFieldError(e.fieldError('url') ?? e.fieldError('body') ?? null);
      } else {
        setError('İstek gönderilemedi.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-18)' }}>
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-card)',
          padding: 'var(--s-18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-14)',
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>
          İstek Cloudflare Worker&apos;ın çıkışından gider. Bir kaynağın bizi engelleyip
          engellemediğini buradan ölçebilirsin.
        </p>

        <div style={{ display: 'flex', gap: 'var(--s-8)', flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setUrl(p.url)}
              style={{
                height: 44,
                padding: '0 var(--s-14)',
                border: '1px solid var(--border-3)',
                borderRadius: 'var(--r-icon)',
                background: url === p.url ? 'var(--brand-ghost-bg)' : 'transparent',
                color: url === p.url ? 'var(--brand-soft-fg)' : 'var(--text-2)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Field label="Adres">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            spellCheck={false}
            autoCapitalize="off"
            style={inputStyle}
          />
        </Field>
        {fieldError && (
          <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>
            {fieldError}
          </span>
        )}

        <div style={{ display: 'flex', gap: 'var(--s-12)', flexWrap: 'wrap' }}>
          <Field label="Metot">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value === 'POST' ? 'POST' : 'GET')}
              style={{ ...inputStyle, width: 140 }}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </Field>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-8)',
              minHeight: 44,
              alignSelf: 'flex-end',
              fontSize: 14,
              color: 'var(--text-2)',
            }}
          >
            <input type="checkbox" checked={sendUa} onChange={(e) => setSendUa(e.target.checked)} />
            Çekimin User-Agent&apos;ıyla gönder
          </label>
        </div>

        {method === 'POST' && (
          <Field label="Gövde">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              spellCheck={false}
              style={{
                ...inputStyle,
                height: 'auto',
                padding: 'var(--s-12) var(--s-16)',
                fontSize: 13,
                resize: 'vertical',
              }}
            />
          </Field>
        )}

        <button
          className="btn-primary"
          style={{ height: 58, alignSelf: 'flex-start', padding: '0 var(--s-22)' }}
          disabled={busy || url.trim() === ''}
          onClick={() => void send()}
        >
          {busy ? 'Gönderiliyor…' : 'İsteği gönder'}
        </button>
      </div>

      {/* Ağ hatası ya da doğrulama hatası — hedefin durum kodu BURAYA düşmez. */}
      {error && <ErrorBox message={error} />}

      {busy && <ProbeSkeleton />}

      {!busy && !result && !error && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>
          Henüz istek göndermedin. Yukarıdan bir adres seçip dene.
        </p>
      )}

      {!busy && result && <ProbeResultView result={result} />}
    </div>
  );
}

/** Yanıtın gerçek iskeletini taşır ki sonuç gelince düzen zıplamasın. */
function ProbeSkeleton() {
  return (
    <div
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-12)' }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Yanıt bekleniyor…</span>
      <div className="skeleton" style={{ height: 44, width: '62%' }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="skeleton" style={{ height: 180 }} />
    </div>
  );
}

function ProbeResultView({ result }: { result: ProbeResult }) {
  const ok = result.status >= 200 && result.status < 300;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-14)' }}>
      <div
        role="status"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-12)', flexWrap: 'wrap' }}
      >
        <span
          style={{
            background: ok ? 'var(--brand-soft-bg)' : 'var(--warn-soft-bg)',
            color: ok ? 'var(--brand-soft-fg)' : 'var(--warn-fg)',
            borderRadius: 'var(--r-badge)',
            padding: '6px 14px',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 15,
          }}
          className="tnum"
        >
          {result.status} {result.statusText}
        </span>
        <span className="tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>
          {result.durationMs} ms · {result.bodyBytes.toLocaleString('tr-TR')} bayt
          {result.truncated && ' · 64 KB’de kırpıldı'}
        </span>
      </div>

      {/* Engellenme sinyalini yorumlamayı kullanıcıya bırakmıyoruz. */}
      {(result.status === 403 || result.status === 429) && (
        <p
          style={{
            margin: 0,
            background: 'var(--warn-soft-bg)',
            color: 'var(--warn-fg)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 14,
          }}
        >
          Hedef bu ortamdan gelen isteği reddetti. Kaynak büyük olasılıkla veri merkezi
          IP&apos;lerini engelliyor — kod tarafında bir sorun olduğu anlamına gelmez.
        </p>
      )}

      <Section title="Yanıt başlıkları">
        {result.headers.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>Başlık dönmedi.</p>
        ) : (
          <dl style={{ margin: 0, display: 'grid', gap: 'var(--s-6)' }}>
            {result.headers.map((h) => (
              <div key={h.name} style={{ display: 'flex', gap: 'var(--s-8)', flexWrap: 'wrap' }}>
                <dt style={{ color: 'var(--text-3)', fontSize: 13, minWidth: 160 }}>{h.name}</dt>
                <dd style={{ margin: 0, fontSize: 13, wordBreak: 'break-all' }}>{h.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title="Gövde">
        {result.body === '' ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>Gövde boş döndü.</p>
        ) : (
          <pre
            style={{
              margin: 0,
              maxHeight: 380,
              overflow: 'auto',
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {result.body}
          </pre>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-card)',
        padding: 'var(--s-18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-12)',
      }}
    >
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
