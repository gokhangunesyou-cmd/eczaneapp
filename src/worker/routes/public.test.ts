import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dutyDateOf } from '@shared/duty';
import type { components } from '@shared/api-types';

type PharmacyList = components['schemas']['PharmacyList'];
type DistrictList = components['schemas']['DistrictList'];
type Health = components['schemas']['Health'];
type ErrorBody = components['schemas']['Error'];

// Saat sabitlenir: nöbet rotasyonu 08:00 TRT (05:00 UTC).
// 2026-08-08T12:00:00Z → 15:00 TRT, yani 2026-08-08 nöbet gününün ortası.
const NOW = new Date('2026-08-08T12:00:00Z');

const MURATPASA = { lat: 36.8862, lng: 30.7056 };

async function seed() {
  await env.DB.prepare('DELETE FROM duty_shift').run();
  await env.DB.prepare('DELETE FROM pharmacy').run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pharmacy (id, slug, name, phone, address, district_code, lat, lng)
       VALUES (1, 'antalya/muratpasa/deniz-eczanesi', 'Deniz Eczanesi', '+902422371414',
               'Tahılpazarı Mah.', '2037', 36.8862, 30.7056)`,
    ),
    env.DB.prepare(
      `INSERT INTO pharmacy (id, slug, name, phone, address, district_code, lat, lng)
       VALUES (2, 'antalya/kepez/kepez-saglik-eczanesi', 'Kepez Sağlık Eczanesi', NULL,
               'Yeşilırmak Cad.', '1583', 36.9330, 30.6800)`,
    ),
    env.DB.prepare(
      `INSERT INTO pharmacy (id, slug, name, phone, address, district_code, lat, lng)
       VALUES (3, 'antalya/alanya/alanya-sifa-eczanesi', 'Alanya Şifa Eczanesi', NULL,
               'Saray Mah.', '1126', 36.5440, 32.0000)`,
    ),
  ]);
}

/**
 * Nöbet penceresi ARTIK HESAPLANMIYOR, kaynaktan okunuyor (ADR-005).
 * Antalya'da rotasyon 08:30; merkez ilçelerde nöbet yalnızca akşam başlıyor.
 * Testler bu yüzden pencereyi açıkça verir.
 */
async function assignDuty(pharmacyId: number, date: string, startHourUtc = 5, endHourUtc = 5) {
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  await env.DB.prepare(
    `INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, source)
     VALUES (?1, ?2, ?3, ?4, 'edevlet')`,
  )
    .bind(
      pharmacyId,
      date,
      `${date}T${pad(startHourUtc)}:30:00Z`,
      `${next}T${pad(endHourUtc)}:30:00Z`,
    )
    .run();
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  await seed();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/pharmacies/on-duty', () => {
  it('konuma göre en yakını başa koyar ve mesafe/süre hesaplar', async () => {
    const today = dutyDateOf(NOW);
    await assignDuty(1, today);
    await assignDuty(2, today);

    const res = await SELF.fetch(
      `https://x/api/pharmacies/on-duty?lat=${MURATPASA.lat}&lng=${MURATPASA.lng}`,
    );
    expect(res.status).toBe(200);

    const body = await res.json<PharmacyList>();
    expect(body.stale).toBe(false);
    expect(body.items).toHaveLength(2);

    // Deniz Eczanesi tam kullanıcının konumunda → ilk sırada, ~0 m.
    expect(body.items[0]!.name).toBe('Deniz Eczanesi');
    expect(body.items[0]!.distanceM).toBeLessThan(600);
    expect(body.items[0]!.etaMin).toBeGreaterThanOrEqual(1);
    expect(body.items[0]!.status).toBe('open');

    // Kepez daha uzak.
    expect(body.items[1]!.distanceM!).toBeGreaterThan(body.items[0]!.distanceM!);
  });

  it('ilçeye göre sorguda mesafe ve süre null döner', async () => {
    const today = dutyDateOf(NOW);
    await assignDuty(1, today);
    await assignDuty(2, today);

    const res = await SELF.fetch('https://x/api/pharmacies/on-duty?district=1583');
    const body = await res.json<PharmacyList>();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.name).toBe('Kepez Sağlık Eczanesi');
    expect(body.items[0]!.distanceM).toBeNull();
    expect(body.items[0]!.etaMin).toBeNull();
  });

  it('rotasyon anının hemen ardından bugünün nöbetini görür', async () => {
    // 05:30:00.400Z — milisaniye kırpılmasaydı duty_start > now olurdu.
    const justAfter = new Date('2026-08-08T05:30:00.400Z');
    vi.setSystemTime(justAfter);
    await assignDuty(1, dutyDateOf(justAfter));

    const res = await SELF.fetch('https://x/api/pharmacies/on-duty');
    const body = await res.json<PharmacyList>();

    expect(body.stale).toBe(false);
    expect(body.items).toHaveLength(1);
  });

  it('dünün nöbeti bugün görünmez', async () => {
    const yesterday = dutyDateOf(new Date(NOW.getTime() - 86_400_000));
    await assignDuty(1, yesterday);

    const res = await SELF.fetch('https://x/api/pharmacies/on-duty');
    const body = await res.json<PharmacyList>();

    expect(body.items).toHaveLength(0);
    expect(body.stale).toBe(true); // bugün için kayıt yok
  });

  it('includeExpired ile biten nöbet closed olarak döner', async () => {
    const yesterday = dutyDateOf(new Date(NOW.getTime() - 86_400_000));
    await assignDuty(1, yesterday);

    const res = await SELF.fetch('https://x/api/pharmacies/on-duty?includeExpired=true');
    const body = await res.json<PharmacyList>();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.status).toBe('closed');
    expect(body.items[0]!.minutesUntilClose).toBeLessThan(0);
  });

  it('kapanışa 2 saatten az kalınca closing_soon olur', async () => {
    const today = dutyDateOf(NOW);
    await assignDuty(1, today);
    // Nöbet ertesi gün 05:30Z bitiyor; 04:00Z → 90 dakika kaldı.
    vi.setSystemTime(new Date('2026-08-09T04:00:00Z'));

    const res = await SELF.fetch('https://x/api/pharmacies/on-duty');
    const body = await res.json<PharmacyList>();

    expect(body.items[0]!.status).toBe('closing_soon');
    expect(body.items[0]!.minutesUntilClose).toBe(90);
  });

  it('veri yoksa 200 ve boş dizi döner, 404 değil', async () => {
    const res = await SELF.fetch('https://x/api/pharmacies/on-duty');
    expect(res.status).toBe(200);
    const body = await res.json<PharmacyList>();
    expect(body.items).toEqual([]);
    expect(body.stale).toBe(true);
  });

  it('lat lng olmadan verilirse 400 ve alan yolu döner', async () => {
    const res = await SELF.fetch('https://x/api/pharmacies/on-duty?lat=36.8');
    expect(res.status).toBe(400);
  });

  it('konum ve ilçe birlikte verilemez', async () => {
    const res = await SELF.fetch(
      'https://x/api/pharmacies/on-duty?lat=36.8&lng=30.7&district=2037',
    );
    expect(res.status).toBe(400);
  });

  it('geçersiz ilçe kodu 400 döner', async () => {
    const res = await SELF.fetch('https://x/api/pharmacies/on-duty?district=9999');
    expect(res.status).toBe(400);
    const body = await res.json<ErrorBody>();
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details?.[0]?.path).toBe('district');
  });

  // ADR-006: kapsam 81 il. Verisi olmayan il HATA DEĞİL, boş liste.
  it('verisi olmayan il 200 ve boş liste döner', async () => {
    await seed();
    await assignDuty(1, dutyDateOf(NOW));

    const res = await SELF.fetch('https://x/api/pharmacies/on-duty?city=34');
    expect(res.status).toBe(200);

    const body = await res.json<PharmacyList>();
    expect(body.items).toEqual([]);
    expect(body.cityCode).toBe(34);
    // Antalya'nın verisi taze olsa bile İstanbul kullanıcısı için bayat.
    expect(body.stale).toBe(true);
  });

  it('limit, alfabetik ilk N değil EN YAKIN N kaydı verir', async () => {
    await seed();
    const day = dutyDateOf(NOW);
    // Üçü de nöbetçi. Alfabetik sıra: Alanya(3) → Deniz(1) → Kepez(2).
    // Muratpaşa'dan mesafe sırası: Deniz(1) → Kepez(2) → Alanya(3).
    await assignDuty(1, day);
    await assignDuty(2, day);
    await assignDuty(3, day);

    const res = await SELF.fetch(
      `https://x/api/pharmacies/on-duty?lat=${MURATPASA.lat}&lng=${MURATPASA.lng}&limit=1`,
    );
    const body = await res.json<PharmacyList>();

    expect(body.items).toHaveLength(1);
    // SQL LIMIT sıralamadan önce uygulansaydı burada "Alanya Şifa" dönerdi.
    expect(body.items[0]?.name).toBe('Deniz Eczanesi');
  });

  it('il verilmezse konumdan çözülür', async () => {
    await seed();
    await assignDuty(1, dutyDateOf(NOW));

    const res = await SELF.fetch(
      `https://x/api/pharmacies/on-duty?lat=${MURATPASA.lat}&lng=${MURATPASA.lng}`,
    );
    const body = await res.json<PharmacyList>();

    expect(body.cityCode).toBe(7);
    expect(body.items).toHaveLength(1);
  });

  it('yakında eczane yoksa il merkezlerine göre çözülür', async () => {
    await seed();
    await assignDuty(1, dutyDateOf(NOW));

    // Ankara'nın göbeği: en yakın eczane 300 km ötede, kutuya girmiyor.
    const res = await SELF.fetch('https://x/api/pharmacies/on-duty?lat=39.93&lng=32.86');
    const body = await res.json<PharmacyList>();

    expect(body.cityCode).toBe(6);
    expect(body.items).toEqual([]);
    expect(body.stale).toBe(true);
  });

  it('elle seçilen il konumdan çözümü ezer', async () => {
    await seed();
    await assignDuty(1, dutyDateOf(NOW));

    const res = await SELF.fetch(
      `https://x/api/pharmacies/on-duty?lat=${MURATPASA.lat}&lng=${MURATPASA.lng}&city=34`,
    );
    expect((await res.json<PharmacyList>()).cityCode).toBe(34);
  });
});

describe('GET /api/districts', () => {
  it('nöbetçisi olmayan ilçeleri de sayıyla birlikte döner', async () => {
    await assignDuty(1, dutyDateOf(NOW));

    const res = await SELF.fetch('https://x/api/districts');
    expect(res.status).toBe(200);

    const body = await res.json<DistrictList>();
    const muratpasa = body.items.find((d) => d.code === '2037');
    const kepez = body.items.find((d) => d.code === '1583');

    expect(muratpasa?.onDutyCount).toBe(1);
    expect(kepez?.onDutyCount).toBe(0);
    // Tüm Antalya ilçeleri listelenir (tasarım ekranı 06).
    expect(body.items.length).toBeGreaterThan(10);
  });
});

describe('GET /api/health', () => {
  it('bugünün nöbeti varsa ok', async () => {
    await assignDuty(1, dutyDateOf(NOW));
    const res = await SELF.fetch('https://x/api/health');
    const body = await res.json<Health>();
    expect(body.status).toBe('ok');
    expect(body.stale).toBe(false);
  });

  it('bugünün nöbeti yoksa degraded', async () => {
    const res = await SELF.fetch('https://x/api/health');
    const body = await res.json<Health>();
    expect(body.status).toBe('degraded');
    expect(body.stale).toBe(true);
  });
});

describe('bilinmeyen API yolu', () => {
  it('404 döner, SPA fallback ine düşmez', async () => {
    const res = await SELF.fetch('https://x/api/yok-boyle-bir-sey');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
