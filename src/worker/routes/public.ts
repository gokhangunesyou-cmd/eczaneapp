/** Kimlik doğrulaması gerektirmeyen uçlar. */

import { Hono } from 'hono';
import { validate } from '../lib/validate';
import type { AppEnv } from '../env';
import type { components } from '@shared/api-types';
import { onDutyQuery, districtsQuery } from '../schemas';
import { findOnDuty, lastDutyUpdate, hasDutyForDate } from '../repo/pharmacies';
import { listDistricts, cityOfDistrict } from '../repo/districts';
import { resolveCityByLocation } from '../repo/cities';
import { listCities } from '../repo/import';
import { dutyDateOf, nextRotationAt, cacheTtlSeconds } from '@shared/duty';
import { snapToGrid } from '@shared/geo';
import { badRequest } from '../lib/errors';

type Health = components['schemas']['Health'];
type DistrictList = components['schemas']['DistrictList'];
type PharmacyList = components['schemas']['PharmacyList'];

export const publicRoutes = new Hono<AppEnv>();

// ─── /api/health ────────────────────────────────────────────────────────────
publicRoutes.get('/health', async (c) => {
  const now = new Date();
  const [lastAt, hasToday] = await Promise.all([
    lastDutyUpdate(c.env.DB),
    hasDutyForDate(c.env.DB, dutyDateOf(now)),
  ]);

  const body: Health = {
    status: hasToday ? 'ok' : 'degraded',
    version: '0.1.0',
    lastSyncAt: lastAt,
    stale: !hasToday,
  };
  // Sağlık ucu cache'lenmez — durumu anlık görmek gerekir.
  return c.json(body, 200, { 'Cache-Control': 'no-store' });
});

// ─── /api/cities ────────────────────────────────────────────────────────────
// Çekim komutu il argümanını (plaka ya da slug) buradan çözer.
publicRoutes.get('/cities', async (c) => {
  const items = await listCities(c.env.DB);
  return c.json({ items }, 200, { 'Cache-Control': 'public, max-age=3600' });
});

// ─── /api/districts ─────────────────────────────────────────────────────────
publicRoutes.get('/districts', validate('query', districtsQuery), async (c) => {
  const { city } = c.req.valid('query');
  const now = new Date();

  // İl kapısı YOK (ADR-006): 81 ilin hepsi servis ediliyor. Verisi olmayan il
  // hata değil, boş liste + `stale: true` döner.
  const [items, lastAt, hasToday] = await Promise.all([
    listDistricts(c.env.DB, city, now),
    lastDutyUpdate(c.env.DB),
    hasDutyForDate(c.env.DB, dutyDateOf(now), city),
  ]);

  const body: DistrictList = {
    cityCode: city,
    stale: !hasToday,
    dataAsOf: lastAt,
    items,
  };

  const ttl = cacheTtlSeconds(now, Number(c.env.CACHE_MAX_TTL_SECONDS));
  return c.json(body, 200, { 'Cache-Control': `public, max-age=60, s-maxage=${ttl}` });
});

// ─── /api/pharmacies/on-duty ────────────────────────────────────────────────
publicRoutes.get('/pharmacies/on-duty', validate('query', onDutyQuery), async (c) => {
  const q = c.req.valid('query');
  const now = new Date();

  const districtCity = q.district ? await cityOfDistrict(c.env.DB, q.district) : null;

  if (q.district && districtCity === null) {
    throw badRequest('Böyle bir ilçe yok.', [{ path: 'district', message: 'Geçersiz ilçe kodu.' }]);
  }

  // Konumu ~500 m ızgaraya yuvarla: cache isabeti artar, D1 satır okuma
  // kotası korunur (ADR-003). Mesafe hassasiyeti kaybı kullanıcı için önemsiz.
  const near = q.lat !== undefined && q.lng !== undefined ? snapToGrid(q.lat, q.lng) : undefined;

  // İl önceliği: elle seçim > ilçenin ili > konumdan çözüm > varsayılan.
  // Konumdan çözüm ızgaraya yuvarlanmış koordinatla yapılır ki aynı mahalledeki
  // iki kullanıcı aynı cache girdisini paylaşsın.
  const cityCode =
    q.city ??
    districtCity ??
    (near ? await resolveCityByLocation(c.env.DB, near.lat, near.lng) : null) ??
    Number(c.env.SUPPORTED_CITY_CODE);

  const [items, lastAt, hasToday] = await Promise.all([
    findOnDuty(c.env.DB, {
      now,
      cityCode,
      limit: q.limit,
      includeExpired: q.includeExpired,
      ...(near ? { near } : {}),
      ...(q.district ? { districtCode: q.district } : {}),
    }),
    lastDutyUpdate(c.env.DB),
    hasDutyForDate(c.env.DB, dutyDateOf(now), cityCode),
  ]);

  const body: PharmacyList = {
    stale: !hasToday,
    dataAsOf: lastAt,
    nextRotationAt: nextRotationAt(now),
    cityCode,
    items,
  };

  // Veri bayatsa TTL'i kısalt — düzeltme hızlı yayılsın (ADR-003).
  const ttl = hasToday ? cacheTtlSeconds(now, Number(c.env.CACHE_MAX_TTL_SECONDS)) : 60;
  return c.json(body, 200, { 'Cache-Control': `public, max-age=30, s-maxage=${ttl}` });
});
