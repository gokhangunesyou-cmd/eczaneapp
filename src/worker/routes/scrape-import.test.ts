/**
 * Uçtan uca: kaynağın HTML'i → ayrıştırma → /api/admin/import → D1 →
 * /api/pharmacies/on-duty (ADR-007).
 *
 * Gerçek workerd, gerçek D1. Ayrıştırıcının birim testi ayrı dosyada
 * (`scripts/lib/eczaneler-parse.test.mjs`); buradaki soru farklı: çekimin
 * ürettiği kayıtlar yazıldığında kullanıcı GERÇEKTEN nöbetçi eczane görüyor mu?
 *
 * Asıl riski bu test tutuyor: kaynak nöbet SAATİ vermiyor, saatler bizim
 * rotasyon modelimizden türetiliyor. Türetme yanlış olsa liste dolar ama her
 * eczane "kapalı" görünürdü — burada `status: 'open'` iddia ediliyor.
 */

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import type { components } from '@shared/api-types';
import { dutyDateOf } from '@shared/duty';

// Vite'ın `?raw` yüklemesi; kaynaktan olduğu gibi alınmış gerçek yanıt.
import fixture from '../../../tests/fixtures/eczaneler-van.html?raw';
// Çekim komutunun ayrıştırıcısı — tipleri yanındaki .d.ts'ten geliyor.
import { parseCity, toImportItems } from '../../../scripts/lib/eczaneler-parse.mjs';

type PharmacyList = components['schemas']['PharmacyList'];

const VAN = { code: 65, name: 'Van', slug: 'van' };

// Nöbet günü SABİT YAZILMAZ. Okuma yolunun `at` gibi bir parametresi yok, hep
// "şimdi"ye bakıyor; sabit bir tarih yazsak test yalnızca o gün geçerdi. Çekim
// nasıl davranıyorsa test de öyle davranır: içinde bulunulan nöbet gününe yazar,
// aynı günü okur. Üretimdeki zincirin aynısı.
const DUTY_DATE = dutyDateOf(new Date());

/** Van il merkezi — okuma yolu konuma göre sıralama istiyor. */
const NEAR_VAN = { lat: 38.4891, lng: 43.409 };

beforeAll(async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test'),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 60_000 },
    key,
    256,
  );
  const b64 = (b: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
  env.ADMIN_PASSWORD_HASH = `pbkdf2$sha256$60000$${b64(salt)}$${b64(bits)}`;
  env.ADMIN_USERNAME = 'test';
});

async function login(): Promise<string> {
  const res = await SELF.fetch('https://x/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test' }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

describe('eczaneler.gen.tr çekimi → içe aktarma → okuma yolu', () => {
  it('kaynağın yanıtı kullanıcının gördüğü listeye dönüşür', async () => {
    const rows = parseCity(fixture, VAN.name);
    const { items, skipped } = toImportItems(rows, VAN, DUTY_DATE);
    expect(skipped).toHaveLength(0);

    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        cityCode: VAN.code,
        dutyDate: DUTY_DATE,
        source: 'edevlet',
        items,
      }),
    });

    expect(res.status).toBe(200);
    const result = await res.json<components['schemas']['ImportResult']>();

    // Van bu depoda hiç görülmemiş bir il: ilçeleri de eczaneleri de çekim açar.
    expect(result.pharmaciesCreated).toBe(items.length);
    expect(result.dutiesWritten).toBe(items.length);
    expect(result.districtsCreated).toBeGreaterThan(0);
  });

  it('türetilen nöbet penceresi ŞU AN geçerlidir', async () => {
    // Kaynak saat vermiyor; saatler bizim rotasyon modelimizden geliyor. Türetme
    // yanlış olsaydı liste dolar ama hiçbiri şu an nöbetçi olmazdı — okuma yolu
    // `includeExpired` olmadan biteni hiç döndürmediği için boş liste gelirdi.
    const res = await SELF.fetch(
      `https://x/api/pharmacies/on-duty?lat=${NEAR_VAN.lat}&lng=${NEAR_VAN.lng}&city=65`,
    );
    expect(res.status).toBe(200);

    const body = await res.json<PharmacyList>();
    expect(body.stale).toBe(false);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((p) => p.status !== 'closed')).toBe(true);

    const now = Date.now();
    for (const p of body.items) {
      expect(new Date(p.dutyStart).getTime()).toBeLessThanOrEqual(now);
      expect(new Date(p.dutyEnd).getTime()).toBeGreaterThan(now);
    }
  });

  it('koordinatsız eczane listede kalır, sadece haritada yoktur', async () => {
    const res = await SELF.fetch(
      `https://x/api/pharmacies/on-duty?lat=${NEAR_VAN.lat}&lng=${NEAR_VAN.lng}&city=65&limit=50`,
    );
    const body = await res.json<PharmacyList>();

    const arjin = body.items.find((p) => p.name === 'Arjin Eczanesi');
    expect(arjin).toBeDefined();
    expect(arjin!.lat).toBeNull();

    // Geri kalanın ezici çoğunluğu koordinatlı — kaynağı seçme gerekçesi buydu.
    const withCoords = body.items.filter((p) => p.lat !== null).length;
    expect(withCoords / body.items.length).toBeGreaterThan(0.8);
  });

  it('ikinci koşu mükerrer kayıt açmaz', async () => {
    const rows = parseCity(fixture, VAN.name);
    const { items } = toImportItems(rows, VAN, DUTY_DATE);

    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        cityCode: VAN.code,
        dutyDate: DUTY_DATE,
        source: 'edevlet',
        items,
      }),
    });

    const result = await res.json<components['schemas']['ImportResult']>();
    expect(result.pharmaciesCreated).toBe(0);
    expect(result.pharmaciesUpdated).toBe(items.length);
  });
});
