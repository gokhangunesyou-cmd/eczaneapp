import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { components } from '@shared/api-types';

type AdminPharmacy = components['schemas']['AdminPharmacy'];
type DutyShift = components['schemas']['DutyShift'];
type ErrorBody = components['schemas']['Error'];

const VALID = {
  name: 'Test Eczanesi',
  phone: '0242 237 14 14',
  address: 'Tahılpazarı Mah. Ali Çetinkaya Cad. No:41/A',
  districtCode: '2037',
  lat: 36.8862,
  lng: 30.7056,
  notes: null,
};

/** Testler için env'e gerçek bir PBKDF2 hash'i koyar. Parola: "test". */
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
  expect(res.status).toBe(204);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie!.split(';')[0]!;
}

const auth = (cookie: string) => ({ Cookie: cookie, 'content-type': 'application/json' });

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM duty_shift').run();
  await env.DB.prepare('DELETE FROM audit_log').run();
  await env.DB.prepare('DELETE FROM pharmacy').run();
});

describe('oturum', () => {
  it('doğru bilgiyle 204 ve HttpOnly SameSite çerez kurar', async () => {
    const res = await SELF.fetch('https://x/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test' }),
    });
    expect(res.status).toBe(204);

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure'); // https:// istek
  });

  it('yanlış parola 401 döner', async () => {
    const res = await SELF.fetch('https://x/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'yanlis' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json<ErrorBody>();
    expect(body.error.code).toBe('unauthorized');
    // Mesaj hangi alanın yanlış olduğunu SIZDIRMAMALI.
    expect(body.error.message).not.toMatch(/kullanıcı adı doğru|parola doğru/i);
  });

  it('yanlış kullanıcı adı da 401 döner', async () => {
    const res = await SELF.fetch('https://x/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'baskasi', password: 'test' }),
    });
    expect(res.status).toBe(401);
  });

  it('çerezsiz istek 401 döner', async () => {
    const res = await SELF.fetch('https://x/api/admin/pharmacies');
    expect(res.status).toBe(401);
  });

  it('kurcalanmış çerez 401 döner', async () => {
    const cookie = await login();

    // İmzanın SON karakteri değiştirilmez: base64url'de son karakter bazen
    // yalnızca 2 bit taşır ve farklı harfler AYNI bayta çözülür — test rastgele
    // geçerdi. Bunun yerine imzanın ilk karakteri değiştirilir; o 6 bitin
    // tamamını taşıdığı için imza her zaman bozulur.
    const dot = cookie.indexOf('.');
    const first = cookie[dot + 1];
    const tampered = cookie.slice(0, dot + 1) + (first === 'A' ? 'B' : 'A') + cookie.slice(dot + 2);
    const res = await SELF.fetch('https://x/api/admin/pharmacies', {
      headers: { Cookie: tampered },
    });
    expect(res.status).toBe(401);
  });

  it('/me geçerli oturumda kullanıcı adını döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/me', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect((await res.json<{ username: string }>()).username).toBe('test');
  });
});

describe('eczane CRUD', () => {
  it('ekler, telefonu E.164 e normalize eder', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(201);

    const created = await res.json<AdminPharmacy>();
    expect(created.phone).toBe('+902422371414');
    expect(created.districtName).toBe('Muratpaşa');
    expect(created.id).toBeGreaterThan(0);
  });

  it('aynı ilçede aynı ad 409 döner', async () => {
    const cookie = await login();
    await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify(VALID),
    });
    const res = await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(409);
  });

  it('geçersiz ilçe kodu 400 ve alan yolu döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify({ ...VALID, districtCode: '9999' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<ErrorBody>();
    expect(body.error.details?.[0]?.path).toBe('districtCode');
  });

  it('Türkiye sınırları dışındaki koordinat 400 döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify({ ...VALID, lat: 51.5, lng: -0.12 }),
    });
    expect(res.status).toBe(400);
  });

  it('günceller ve siler', async () => {
    const cookie = await login();
    const created = await (
      await SELF.fetch('https://x/api/admin/pharmacies', {
        method: 'POST',
        headers: auth(cookie),
        body: JSON.stringify(VALID),
      })
    ).json<AdminPharmacy>();

    const patched = await SELF.fetch(`https://x/api/admin/pharmacies/${created.id}`, {
      method: 'PATCH',
      headers: auth(cookie),
      body: JSON.stringify({ ...VALID, name: 'Yeni Ad' }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json<AdminPharmacy>()).name).toBe('Yeni Ad');

    const del = await SELF.fetch(`https://x/api/admin/pharmacies/${created.id}`, {
      method: 'DELETE',
      headers: auth(cookie),
    });
    expect(del.status).toBe(204);

    const again = await SELF.fetch(`https://x/api/admin/pharmacies/${created.id}`, {
      method: 'DELETE',
      headers: auth(cookie),
    });
    expect(again.status).toBe(404);
  });

  it('arama adda ve adreste eşleşir', async () => {
    const cookie = await login();
    await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify(VALID),
    });

    const res = await SELF.fetch('https://x/api/admin/pharmacies?q=Çetinkaya', {
      headers: { Cookie: cookie },
    });
    const body = await res.json<{ total: number; items: AdminPharmacy[] }>();
    expect(body.total).toBe(1);
    expect(body.items[0]!.name).toBe('Test Eczanesi');
  });
});

describe('nöbet atama', () => {
  async function makePharmacy(cookie: string): Promise<AdminPharmacy> {
    const res = await SELF.fetch('https://x/api/admin/pharmacies', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify(VALID),
    });
    return await res.json<AdminPharmacy>();
  }

  it('nöbet atar ve pencereyi varsayılan rotasyona oturtur', async () => {
    const cookie = await login();
    const p = await makePharmacy(cookie);

    const res = await SELF.fetch('https://x/api/admin/duties', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify({ pharmacyId: p.id, date: '2026-08-08' }),
    });
    expect(res.status).toBe(201);

    const duty = await res.json<DutyShift>();
    // Panelden elle atamada pencere varsayılan rotasyona oturur (08:00 TRT).
    // Kaynaktan gelen nöbetlerin saati farklı olabilir (ADR-005).
    expect(duty.dutyStart).toBe('2026-08-08T05:00:00Z');
    expect(duty.dutyEnd).toBe('2026-08-09T05:00:00Z');
    expect(duty.pharmacyName).toBe('Test Eczanesi');
  });

  it('aynı eczane aynı gün ikinci kez atanamaz', async () => {
    const cookie = await login();
    const p = await makePharmacy(cookie);
    const body = JSON.stringify({ pharmacyId: p.id, date: '2026-08-08' });

    await SELF.fetch('https://x/api/admin/duties', {
      method: 'POST',
      headers: auth(cookie),
      body,
    });
    const res = await SELF.fetch('https://x/api/admin/duties', {
      method: 'POST',
      headers: auth(cookie),
      body,
    });
    expect(res.status).toBe(409);
  });

  it('olmayan eczaneye atama 404 döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/duties', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify({ pharmacyId: 999999, date: '2026-08-08' }),
    });
    expect(res.status).toBe(404);
  });

  it('eczane silinince nöbeti de silinir', async () => {
    const cookie = await login();
    const p = await makePharmacy(cookie);
    await SELF.fetch('https://x/api/admin/duties', {
      method: 'POST',
      headers: auth(cookie),
      body: JSON.stringify({ pharmacyId: p.id, date: '2026-08-08' }),
    });

    await SELF.fetch(`https://x/api/admin/pharmacies/${p.id}`, {
      method: 'DELETE',
      headers: auth(cookie),
    });

    const res = await SELF.fetch('https://x/api/admin/duties?date=2026-08-08', {
      headers: { Cookie: cookie },
    });
    expect((await res.json<{ items: DutyShift[] }>()).items).toHaveLength(0);
  });

  it('yazma işlemleri denetim kaydına düşer', async () => {
    const cookie = await login();
    await makePharmacy(cookie);

    const row = await env.DB.prepare(
      "SELECT actor, action FROM audit_log WHERE action = 'pharmacy.create' LIMIT 1",
    ).first<{ actor: string; action: string }>();

    expect(row?.actor).toBe('test');
  });
});

// Veri 81 ili kapsıyor (ADR-006); panelin listeleri il filtresi ve sayfalama
// olmadan kullanılamaz hale gelir.
describe('panel filtreleri ve takvim', () => {
  /** Antalya dışında bir ilçe — il filtresinin gerçekten süzdüğünü göstermek için. */
  async function seedTwoCities() {
    await env.DB.prepare(
      `INSERT INTO district (code, city_code, name, slug, sort_order)
       VALUES ('3401', 34, 'Kadıköy', 'kadikoy', 1)
       ON CONFLICT (code) DO NOTHING`,
    ).run();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pharmacy (slug, name, phone, address, district_code, lat, lng, coord_source)
         VALUES ('antalya/muratpasa/ada', 'ADA', NULL, 'Adres 1', '2037', 36.88, 30.70, 'edevlet')`,
      ),
      env.DB.prepare(
        `INSERT INTO pharmacy (slug, name, phone, address, district_code, lat, lng, coord_source)
         VALUES ('istanbul/kadikoy/bahar', 'BAHAR', NULL, 'Adres 2', '3401', 40.99, 29.03, 'edevlet')`,
      ),
    ]);

    const rows = await env.DB.prepare('SELECT id, slug FROM pharmacy ORDER BY id').all<{
      id: number;
      slug: string;
    }>();
    const idOf = (slug: string) => rows.results.find((r) => r.slug === slug)!.id;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, source, created_by)
         VALUES (?1, '2026-08-08', '2026-08-08T05:00:00Z', '2026-08-09T05:00:00Z', 'edevlet', 'scrape')`,
      ).bind(idOf('antalya/muratpasa/ada')),
      env.DB.prepare(
        `INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, source, created_by)
         VALUES (?1, '2026-08-08', '2026-08-08T05:00:00Z', '2026-08-09T05:00:00Z', 'manual', 'test')`,
      ).bind(idOf('istanbul/kadikoy/bahar')),
      env.DB.prepare(
        `INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, source, created_by)
         VALUES (?1, '2026-08-09', '2026-08-09T05:00:00Z', '2026-08-10T05:00:00Z', 'edevlet', 'scrape')`,
      ).bind(idOf('antalya/muratpasa/ada')),
    ]);
  }

  it('nöbet listesi il filtresiyle süzülür ve toplamı bildirir', async () => {
    const cookie = await login();
    await seedTwoCities();

    const all = await SELF.fetch('https://x/api/admin/duties?date=2026-08-08', {
      headers: { Cookie: cookie },
    });
    const allBody = await all.json<{ total: number; items: DutyShift[] }>();
    expect(allBody.total).toBe(2);

    const antalya = await SELF.fetch('https://x/api/admin/duties?date=2026-08-08&city=7', {
      headers: { Cookie: cookie },
    });
    const oneBody = await antalya.json<{ total: number; items: DutyShift[] }>();
    expect(oneBody.total).toBe(1);
    expect(oneBody.items[0]?.pharmacyName).toBe('ADA');
  });

  it('nöbet listesi sayfalanır; toplam sayfa boyutundan bağımsızdır', async () => {
    const cookie = await login();
    await seedTwoCities();

    const res = await SELF.fetch('https://x/api/admin/duties?date=2026-08-08&limit=1&offset=1', {
      headers: { Cookie: cookie },
    });
    const body = await res.json<{ total: number; items: DutyShift[] }>();

    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(1);
  });

  it('takvim gün başına sayıyı ve kaynak dağılımını verir', async () => {
    const cookie = await login();
    await seedTwoCities();

    const res = await SELF.fetch('https://x/api/admin/duties/calendar?month=2026-08', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    const body = await res.json<{
      month: string;
      cityCode: number | null;
      days: { date: string; count: number; edevletCount: number; manualCount: number }[];
    }>();

    expect(body.cityCode).toBeNull();
    // Yalnızca kayıt bulunan günler döner — boş günler ızgarada zaten boş.
    expect(body.days).toHaveLength(2);

    const first = body.days.find((d) => d.date === '2026-08-08')!;
    expect(first.count).toBe(2);
    expect(first.edevletCount).toBe(1);
    expect(first.manualCount).toBe(1);
  });

  it('takvim il filtresine uyar', async () => {
    const cookie = await login();
    await seedTwoCities();

    const res = await SELF.fetch('https://x/api/admin/duties/calendar?month=2026-08&city=34', {
      headers: { Cookie: cookie },
    });
    const body = await res.json<{ cityCode: number; days: { date: string; count: number }[] }>();

    expect(body.cityCode).toBe(34);
    expect(body.days).toHaveLength(1);
    expect(body.days[0]?.count).toBe(1);
  });

  it('geçersiz ay 400 ve alan yolu döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/duties/calendar?month=2026-8', {
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(400);
    const body = await res.json<ErrorBody>();
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details?.[0]?.path).toBe('month');
  });

  it('takvim oturumsuz 401 döner', async () => {
    const res = await SELF.fetch('https://x/api/admin/duties/calendar?month=2026-08');
    expect(res.status).toBe(401);
  });

  it('eczane listesi il filtresiyle süzülür', async () => {
    const cookie = await login();
    await seedTwoCities();

    const res = await SELF.fetch('https://x/api/admin/pharmacies?city=34', {
      headers: { Cookie: cookie },
    });
    const body = await res.json<{ total: number; items: AdminPharmacy[] }>();

    expect(body.total).toBe(1);
    expect(body.items[0]?.name).toBe('BAHAR');
  });
});
