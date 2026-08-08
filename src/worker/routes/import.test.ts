import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { components } from '@shared/api-types';

type ImportResult = components['schemas']['ImportResult'];
type AdminPharmacy = components['schemas']['AdminPharmacy'];

// ADR-005'in üç kritik kuralı burada garanti altına alınıyor:
//   1. slug doğal anahtar — aynı slug yeni kayıt açmaz
//   2. elle girilen koordinat ASLA ezilmez
//   3. kaynaktan çıkan eczane asılı kalmaz, elle eklenen kaybolmaz

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

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  slug: 'antalya/muratpasa/deniz',
  name: 'DENİZ',
  districtName: 'Muratpaşa',
  districtSlug: 'muratpasa',
  address: 'Tahılpazarı Mah. No:41',
  phone: '0 - (242) 237 - 1414',
  dutyStart: '2026-08-08T05:30:00Z',
  dutyEnd: '2026-08-09T05:30:00Z',
  lat: 36.8862,
  lng: 30.7056,
  sourceStatus: 'Onaylanmış',
  ...over,
});

const importBody = (items: unknown[], date = '2026-08-08') => ({
  cityCode: 7,
  dutyDate: date,
  source: 'edevlet',
  items,
});

async function doImport(cookie: string, items: unknown[], date?: string) {
  const res = await SELF.fetch('https://x/api/admin/import', {
    method: 'POST',
    headers: { Cookie: cookie, 'content-type': 'application/json' },
    body: JSON.stringify(importBody(items, date)),
  });
  return { status: res.status, body: await res.json<ImportResult>() };
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM duty_shift').run();
  await env.DB.prepare('DELETE FROM audit_log').run();
  await env.DB.prepare('DELETE FROM pharmacy').run();
});

describe('POST /api/admin/import', () => {
  it('oturumsuz 401 döner', async () => {
    const res = await SELF.fetch('https://x/api/admin/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(importBody([item()])),
    });
    expect(res.status).toBe(401);
  });

  it('eczane ve nöbeti yazar, telefonu normalize eder', async () => {
    const cookie = await login();
    const { status, body } = await doImport(cookie, [item()]);

    expect(status).toBe(200);
    expect(body.pharmaciesCreated).toBe(1);
    expect(body.dutiesWritten).toBe(1);

    const row = await env.DB.prepare('SELECT phone, coord_source FROM pharmacy LIMIT 1').first<{
      phone: string;
      coord_source: string;
    }>();
    expect(row?.phone).toBe('+902422371414');
    expect(row?.coord_source).toBe('edevlet');
  });

  it('aynı slug ikinci kez gelirse YENİ kayıt açmaz, günceller', async () => {
    const cookie = await login();
    await doImport(cookie, [item()]);
    const { body } = await doImport(cookie, [item({ address: 'Yeni Adres No:9' })]);

    expect(body.pharmaciesCreated).toBe(0);
    expect(body.pharmaciesUpdated).toBe(1);

    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM pharmacy').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('aynı içe aktarma iki kez koşarsa nöbet kaydı ÇOĞALMAZ', async () => {
    // Günlük iş akışı bugünü ve yarını her koşuda yeniden çekiyor; dün "yarın"
    // olarak yazılan kayıt bugün tekrar geldiğinde ikinci satır açmamalı.
    const cookie = await login();
    const rows = [
      item(),
      item({
        slug: 'antalya/kepez/alya',
        name: 'ALYA',
        districtName: 'Kepez',
        districtSlug: 'kepez',
      }),
    ];

    await doImport(cookie, rows);
    const before = await env.DB.prepare(
      'SELECT id, pharmacy_id, duty_date FROM duty_shift ORDER BY id',
    ).all<{ id: number; pharmacy_id: number; duty_date: string }>();

    const { body } = await doImport(cookie, rows);
    const after = await env.DB.prepare(
      'SELECT id, pharmacy_id, duty_date FROM duty_shift ORDER BY id',
    ).all<{ id: number; pharmacy_id: number; duty_date: string }>();

    expect(before.results).toHaveLength(2);
    expect(after.results).toHaveLength(2);
    // Eczane kimlikleri de sabit kalmalı — slug doğal anahtar.
    expect(after.results.map((r) => r.pharmacy_id)).toEqual(
      before.results.map((r) => r.pharmacy_id),
    );
    expect(body.pharmaciesCreated).toBe(0);
  });

  it('farklı günler ayrı nöbet kaydı olur, birbirini silmez', async () => {
    const cookie = await login();
    await doImport(cookie, [item()], '2026-08-08');
    await doImport(
      cookie,
      [item({ dutyStart: '2026-08-09T05:30:00Z', dutyEnd: '2026-08-10T05:30:00Z' })],
      '2026-08-09',
    );

    const { results } = await env.DB.prepare(
      'SELECT duty_date FROM duty_shift ORDER BY duty_date',
    ).all<{ duty_date: string }>();
    expect(results.map((r) => r.duty_date)).toEqual(['2026-08-08', '2026-08-09']);
  });

  it('aynı gövdede mükerrer slug 500 vermez, tekilleştirilir', async () => {
    // Kaynak gerçekten aynı eczaneyi birden çok kez listeliyor (ADR-005).
    const cookie = await login();
    const { status, body } = await doImport(cookie, [item(), item(), item()]);

    expect(status).toBe(200);
    expect(body.pharmaciesCreated).toBe(1);
  });

  it('ELLE girilmiş koordinatı ezmez', async () => {
    const cookie = await login();
    await doImport(cookie, [item()]);

    // Panelden düzelt → coord_source 'manual' olur
    const p = await env.DB.prepare('SELECT id FROM pharmacy LIMIT 1').first<{ id: number }>();
    const patch = await SELF.fetch(`https://x/api/admin/pharmacies/${p!.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'DENİZ',
        phone: '+902422371414',
        address: 'Tahılpazarı Mah. No:41',
        districtCode: '2037',
        lat: 36.9,
        lng: 30.8,
        notes: null,
      }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json<AdminPharmacy>()).coordSource).toBe('manual');

    // Çekim tekrar koşsun — kaynağın koordinatı KAZANMAMALI
    const { body } = await doImport(cookie, [item({ lat: 36.1, lng: 30.1 })]);
    expect(body.coordsPreserved).toBe(1);

    const row = await env.DB.prepare('SELECT lat, lng FROM pharmacy LIMIT 1').first<{
      lat: number;
      lng: number;
    }>();
    expect(row?.lat).toBeCloseTo(36.9, 5);
    expect(row?.lng).toBeCloseTo(30.8, 5);
  });

  it('kaynak koordinat vermezse mevcut koordinatı silmez', async () => {
    const cookie = await login();
    await doImport(cookie, [item()]);
    await doImport(cookie, [item({ lat: null, lng: null })]);

    const row = await env.DB.prepare('SELECT lat FROM pharmacy LIMIT 1').first<{
      lat: number | null;
    }>();
    expect(row?.lat).toBeCloseTo(36.8862, 4);
  });

  it('kaynaktan çıkan eczanenin nöbeti asılı kalmaz', async () => {
    const cookie = await login();
    await doImport(cookie, [
      item(),
      item({
        slug: 'antalya/kepez/alya',
        name: 'ALYA',
        districtName: 'Kepez',
        districtSlug: 'kepez',
      }),
    ]);

    let n = await env.DB.prepare('SELECT COUNT(*) AS n FROM duty_shift').first<{ n: number }>();
    expect(n?.n).toBe(2);

    // İkinci koşuda ALYA kaynakta yok
    const { body } = await doImport(cookie, [item()]);
    expect(body.dutiesRemoved).toBe(2);
    expect(body.dutiesWritten).toBe(1);

    n = await env.DB.prepare('SELECT COUNT(*) AS n FROM duty_shift').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('bilinmeyen ilçeyi ekler', async () => {
    const cookie = await login();
    const { body } = await doImport(cookie, [
      item({
        slug: 'antalya/yeni-ilce/test',
        districtName: 'Yeni İlçe',
        districtSlug: 'yeni-ilce',
      }),
    ]);
    expect(body.districtsCreated).toBe(1);

    const d = await env.DB.prepare("SELECT name FROM district WHERE slug = 'yeni-ilce'").first<{
      name: string;
    }>();
    expect(d?.name).toBe('Yeni İlçe');
  });

  it('yarım koordinat 400 döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/import', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify(importBody([item({ lng: null })])),
    });
    expect(res.status).toBe(400);
  });

  it('tanımsız il 404 döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/import', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...importBody([item()]), cityCode: 99 }),
    });
    expect(res.status).toBe(400); // zod aralık kontrolü önce yakalar
  });
});

describe('GET /api/admin/known-coords', () => {
  it('yalnızca koordinatı DOLU olan slug ları döner', async () => {
    const cookie = await login();
    await doImport(cookie, [
      item(),
      item({
        slug: 'antalya/kepez/alya',
        name: 'ALYA',
        districtName: 'Kepez',
        districtSlug: 'kepez',
        lat: null,
        lng: null,
      }),
    ]);

    const res = await SELF.fetch(
      'https://x/api/admin/known-coords?city=7&slugs=' +
        encodeURIComponent('antalya/muratpasa/deniz,antalya/kepez/alya'),
      { headers: { Cookie: cookie } },
    );
    const body = await res.json<{ slugs: string[] }>();

    expect(body.slugs).toEqual(['antalya/muratpasa/deniz']);
  });
});

describe('GET /api/cities', () => {
  it('81 ili ilçe sayısıyla döner', async () => {
    const res = await SELF.fetch('https://x/api/cities');
    const body = await res.json<{
      items: { code: number; slug: string; districtCount: number }[];
    }>();
    expect(body.items).toHaveLength(81);
    expect(body.items.find((c) => c.code === 7)?.slug).toBe('antalya');
  });
});
