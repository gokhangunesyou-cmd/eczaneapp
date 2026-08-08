import { useState } from 'react';
import {
  adminCreatePharmacy,
  adminUpdatePharmacy,
  ApiClientError,
  type AdminPharmacy,
  type District,
  type PharmacyInput,
} from '@app/lib/api';
import { Field, ErrorBox } from './ui';
import { inputStyle } from './styles';

/**
 * Eczane ekleme/düzenleme formu.
 *
 * Koordinat zorunludur — koordinatsız eczane haritada gösterilemez ve
 * kullanıcıyı yanıltır (ADR-001 sözleşme kuralı). Kullanıcıya koordinatı
 * nereden alacağı söylenir.
 */
export function PharmacyForm({
  editing,
  districts,
  onDone,
  onCancel,
}: {
  editing: AdminPharmacy | null;
  districts: District[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PharmacyInput>(
    editing
      ? {
          name: editing.name,
          phone: editing.phone,
          address: editing.address,
          districtCode: editing.districtCode,
          lat: editing.lat,
          lng: editing.lng,
          notes: editing.notes,
        }
      : {
          name: '',
          phone: '',
          address: '',
          districtCode: districts[0]?.code ?? '0715',
          lat: 36.8969,
          lng: 30.7133,
          notes: null,
        },
  );
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof PharmacyInput>(k: K, v: PharmacyInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await adminUpdatePharmacy(editing.id, form);
      else await adminCreatePharmacy(form);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err : new ApiClientError(0, 'internal', 'Kaydedilemedi.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-14)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-card)',
        padding: 'var(--s-18)',
      }}
    >
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800 }}>
        {editing ? `${editing.name} — düzenle` : 'Yeni eczane'}
      </h2>

      <Field label="Eczane adı">
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
          minLength={2}
          style={inputStyle}
        />
      </Field>

      <Field label="İlçe">
        <select
          value={form.districtCode}
          onChange={(e) => set('districtCode', e.target.value)}
          style={inputStyle}
        >
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Adres">
        <input
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          required
          minLength={5}
          style={inputStyle}
        />
      </Field>

      <Field label="Telefon">
        <input
          value={form.phone ?? ''}
          onChange={(e) => set('phone', e.target.value || null)}
          placeholder="0242 237 14 14"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: 'flex', gap: 'var(--s-12)' }}>
        <div style={{ flex: 1 }}>
          <Field label="Enlem">
            <input
              type="number"
              step="0.000001"
              value={form.lat ?? ''}
              onChange={(e) => set('lat', e.target.value === '' ? null : Number(e.target.value))}
              className="tnum"
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Boylam">
            <input
              type="number"
              step="0.000001"
              value={form.lng ?? ''}
              onChange={(e) => set('lng', e.target.value === '' ? null : Number(e.target.value))}
              className="tnum"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Koordinat zorunlu — haritada gösterilemeyen eczane kullanıcıyı yanıltır. Google Maps&apos;te
        konuma sağ tıkla, çıkan ilk satır <code>enlem, boylam</code>.
      </p>

      <Field label="Not (yalnızca panelde görünür)">
        <input
          value={form.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || null)}
          style={inputStyle}
        />
      </Field>

      {error && (
        <ErrorBox
          message={error.message}
          {...(error.details.length > 0
            ? { extra: error.details.map((d) => `${d.path}: ${d.message}`).join(' · ') }
            : {})}
        />
      )}

      <div style={{ display: 'flex', gap: 'var(--s-12)' }}>
        <button
          className="btn-primary"
          type="submit"
          disabled={busy}
          style={{ flex: 1.25, height: 52 }}
        >
          {busy ? 'Kaydediliyor…' : editing ? 'Güncelle' : 'Ekle'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}
