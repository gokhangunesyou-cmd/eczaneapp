/** Panel uçları — oturum çerezi gerektirir (ADR-004). */

import { Hono } from 'hono';
import { validate } from '../lib/validate';
import type { AppEnv } from '../env';
import type { components } from '@shared/api-types';
import {
  loginBody,
  pharmacyInput,
  adminPharmaciesQuery,
  dutiesQuery,
  dutyCalendarQuery,
  dutyInput,
  idParam,
  knownCoordsQuery,
  importBody,
  scrapeTriggerBody,
  scrapeRunsQuery,
  scrapeRunInput,
  probeBody,
  normalizePhone,
} from '../schemas';
import { verifyPassword, signSession, buildSessionCookie, clearSessionCookie } from '../lib/auth';
import { requireAdmin } from '../middleware/admin';
import { listPharmacies, insertPharmacy, updatePharmacy, deletePharmacy } from '../repo/pharmacies';
import { listDutiesByDate, insertDuty, deleteDuty, dutyCalendar } from '../repo/duties';
import { districtExists } from '../repo/districts';
import { knownCoordSlugs, importDuties, cityExists } from '../repo/import';
import { listScrapeRuns, insertScrapeRun, lastTriggerAt } from '../repo/scrape-runs';
import {
  badRequest,
  unauthorized,
  notFound,
  conflict,
  internal,
  rateLimited,
  dispatchFailed,
  notConfigured,
  ApiError,
} from '../lib/errors';
import { dutyDateOf, isoSeconds } from '@shared/duty';

type AdminPharmacy = components['schemas']['AdminPharmacy'];
type DutyShift = components['schemas']['DutyShift'];
type ScrapeTriggerResult = components['schemas']['ScrapeTriggerResult'];

export const adminRoutes = new Hono<AppEnv>();

const isSecure = (url: string) => new URL(url).protocol === 'https:';

/** D1 UNIQUE ihlali mi? Mesajı sürüme bağlı olduğu için kaba eşleşme yapılır. */
const isUniqueViolation = (e: unknown) =>
  e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

async function audit(
  db: D1Database,
  actor: string,
  action: string,
  entityId: number | null,
  detail: unknown,
): Promise<void> {
  await db
    .prepare('INSERT INTO audit_log (actor, action, entity_id, detail) VALUES (?1, ?2, ?3, ?4)')
    .bind(actor, action, entityId, JSON.stringify(detail).slice(0, 500))
    .run();
}

// ─── Oturum ─────────────────────────────────────────────────────────────────

adminRoutes.post('/session', validate('json', loginBody), async (c) => {
  const { username, password } = c.req.valid('json');

  // Kullanıcı adı yanlış olsa bile parola doğrulaması ÇALIŞTIRILIR.
  // Erken çıkılsaydı yanıt süresi "kullanıcı adı doğruydu" bilgisini sızdırırdı.
  const userOk = username === c.env.ADMIN_USERNAME;
  const passOk = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH);

  if (!userOk || !passOk) {
    throw unauthorized('Kullanıcı adı veya parola hatalı.');
  }

  const ttl = Number(c.env.SESSION_TTL_SECONDS ?? '28800');
  const token = await signSession(
    { u: username, e: Math.floor(Date.now() / 1000) + ttl },
    c.env.SESSION_SECRET,
  );

  c.header('Set-Cookie', buildSessionCookie(token, ttl, isSecure(c.req.url)));
  return c.body(null, 204);
});

adminRoutes.delete('/session', (c) => {
  c.header('Set-Cookie', clearSessionCookie(isSecure(c.req.url)));
  return c.body(null, 204);
});

adminRoutes.get('/me', requireAdmin, (c) => {
  const ttl = Number(c.env.SESSION_TTL_SECONDS ?? '28800');
  return c.json(
    {
      username: c.get('adminUser'),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
});

// Bundan sonraki her şey oturum ister.
//
// DİKKAT: bu liste yol yol yazılıyor, yani YENİ BİR UÇ EKLEYİP BURAYA
// YAZMAMAK onu herkese açık bırakır. Bir kez oldu: `/probe` eklendiğinde
// unutuldu ve uç oturumsuz erişilebilir kaldı — testi olmasa fark edilmezdi.
// Yeni uç eklerken önce buraya bak.
adminRoutes.use('/known-coords', requireAdmin);
adminRoutes.use('/import', requireAdmin);
adminRoutes.use('/pharmacies/*', requireAdmin);
adminRoutes.use('/pharmacies', requireAdmin);
adminRoutes.use('/duties/*', requireAdmin);
adminRoutes.use('/duties', requireAdmin);
adminRoutes.use('/scrape/*', requireAdmin);
adminRoutes.use('/probe', requireAdmin);

// ─── Çekim komutu uçları (ADR-005) ──────────────────────────────────────────

adminRoutes.get('/known-coords', validate('query', knownCoordsQuery), async (c) => {
  const { city, slugs } = c.req.valid('query');
  const found = await knownCoordSlugs(c.env.DB, city, slugs);
  return c.json({ slugs: found }, 200, { 'Cache-Control': 'no-store' });
});

adminRoutes.post('/import', validate('json', importBody), async (c) => {
  const body = c.req.valid('json');

  if (!(await cityExists(c.env.DB, body.cityCode))) {
    throw notFound('Bu il tanımlı değil.');
  }

  // Telefonlar burada normalize edilir; çekim komutu ham gönderebilir.
  const normalized = {
    ...body,
    items: body.items.map((i) => ({ ...i, phone: normalizePhone(i.phone) })),
  };

  const result = await importDuties(c.env.DB, normalized, c.get('adminUser'));

  await audit(c.env.DB, c.get('adminUser'), 'import.edevlet', null, {
    city: body.cityCode,
    date: body.dutyDate,
    items: body.items.length,
    created: result.pharmaciesCreated,
  });

  return c.json(result, 200, { 'Cache-Control': 'no-store' });
});

// ─── Çekim koşuları (ADR-006) ───────────────────────────────────────────────

/**
 * Kaynağa saygı: panelden en fazla 10 dakikada bir tetiklenir (ADR-005).
 * Sayaç ayrı bir yerde tutulmaz — `audit_log` zaten her tetiklemeyi yazıyor.
 */
const TRIGGER_COOLDOWN_MS = 10 * 60_000;

adminRoutes.post('/scrape/trigger', validate('json', scrapeTriggerBody), async (c) => {
  const { scope, days } = c.req.valid('json');

  const repo = c.env.GITHUB_REPO ?? '';
  const token = c.env.GITHUB_DISPATCH_TOKEN ?? '';
  const isLocalScrape = (c.env as any).LOCAL_SCRAPE === '1';

  if (!isLocalScrape && (!repo || !token)) {
    throw notConfigured(
      'Çekim tetikleme bu ortamda kurulu değil. GITHUB_REPO ve GITHUB_DISPATCH_TOKEN gerekiyor.',
    );
  }

  // Zaman karşılaştırması METİN üzerinden: her iki değer de milisaniyesiz UTC.
  const last = await lastTriggerAt(c.env.DB);
  const threshold = isoSeconds(new Date(Date.now() - TRIGGER_COOLDOWN_MS));
  if (last !== null && last > threshold) {
    throw rateLimited('Çekim az önce tetiklendi. Kaynağa yüklenmemek için 10 dakika bekle.');
  }

  if (isLocalScrape) {
    const fn = (c.env as any).TRIGGER_SCRAPE_FN;
    if (typeof fn === 'function') {
      fn(scope, days);
    }
  } else {
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          // GitHub API User-Agent olmadan 403 döner.
          'User-Agent': 'nobetci-eczane-panel',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ event_type: 'scrape', client_payload: { scope, days } }),
      });
    } catch {
      // Ağ hatasının ham metni istemciye sızmaz.
      throw dispatchFailed("GitHub'a ulaşılamadı. Biraz sonra tekrar dene.");
    }

    if (res.status !== 204) {
      throw dispatchFailed(
        `Çekim başlatılamadı (GitHub ${res.status}). Yetkiyi ve depo adını kontrol et.`,
      );
    }
  }

  await audit(c.env.DB, c.get('adminUser'), 'scrape.trigger', null, { scope, days });

  const body: ScrapeTriggerResult = {
    dispatchedAt: isoSeconds(new Date()),
    scope,
    days,
  };
  return c.json(body, 202, { 'Cache-Control': 'no-store' });
});

// ─── Tanı ucu (ADR-007) ─────────────────────────────────────────────────────

/** Gövde bu boyutta kesilir. Worker belleğini ve CPU'sunu bir sayfa yemesin. */
const PROBE_MAX_BODY_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 20_000;

/**
 * Worker'ın kendi çıkışından dış adrese istek atar, yanıtı olduğu gibi gösterir.
 *
 * ADR-003 "istek yolunda kaynağa gidilmez" der; bu uç onun BİLİNÇLİ istisnasıdır.
 * Okuma yolu değil, yöneticinin elle tetiklediği bir tanı: veri döndürmez,
 * önbelleğe girmez, hiçbir şeyi D1'e yazmaz (denetim kaydı hariç).
 *
 * Var olma sebebi ölçülebilir bir soru: eczaneler.gen.tr GitHub Actions'a 403,
 * geliştirici makinesine 200 veriyor. Cloudflare'in çıkışı üçüncü bir ortam ve
 * tahmin etmek yerine denenebilir olmalı.
 */
adminRoutes.post('/probe', validate('json', probeBody), async (c) => {
  const { url, method, headers, body } = c.req.valid('json');

  const target = new URL(url);

  // KENDİ ORIGIN'İMİZE İSTEK ATILAMAZ. İki sebep: Worker'ı kendi kendine
  // çağırtıp döngüye sokmak, ve panelin arkasındaki uçlara dolaylı erişim
  // denemek. Şemada yapılamaz — istek adresini bilmek gerekiyor.
  if (target.host === new URL(c.req.url).host) {
    throw badRequest('Kendi adresimize tanı isteği atılamaz.', [
      { path: 'url', message: 'Dış bir adres ver.' },
    ]);
  }

  const outgoing = new Headers();
  for (const h of headers) outgoing.set(h.name, h.value);

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(target.toString(), {
      method,
      headers: outgoing,
      ...(method === 'POST' && body !== null ? { body } : {}),
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (e) {
    // Ham hata istemciye sızmaz; sebebi ayırt edilebilir kalsın diye tür yazılır.
    const reason = e instanceof Error && e.name === 'TimeoutError' ? 'zaman aşımı' : 'bağlantı yok';
    throw new ApiError('source_unavailable', `Hedefe ulaşılamadı (${reason}).`);
  }

  const raw = await res.text();
  const truncated = raw.length > PROBE_MAX_BODY_BYTES;

  const result: components['schemas']['ProbeResult'] = {
    status: res.status,
    statusText: res.statusText,
    durationMs: Date.now() - started,
    headers: [...res.headers].map(([name, value]) => ({ name, value })),
    body: truncated ? raw.slice(0, PROBE_MAX_BODY_BYTES) : raw,
    bodyBytes: raw.length,
    truncated,
  };

  // Bu uç dışarıya istek attırıyor; kimin nereye attığı kayıt altında olmalı.
  await audit(c.env.DB, c.get('adminUser'), 'probe', null, {
    url: target.toString(),
    method,
    status: res.status,
  });

  return c.json(result, 200, { 'Cache-Control': 'no-store' });
});

adminRoutes.get('/scrape/runs', validate('query', scrapeRunsQuery), async (c) => {
  const q = c.req.valid('query');
  const items = await listScrapeRuns(c.env.DB, {
    ...(q.city === undefined ? {} : { cityCode: q.city }),
    limit: q.limit,
  });
  return c.json({ items }, 200, { 'Cache-Control': 'no-store' });
});

adminRoutes.post('/scrape/runs', validate('json', scrapeRunInput), async (c) => {
  const input = c.req.valid('json');

  if (!(await cityExists(c.env.DB, input.cityCode))) {
    throw badRequest('Bu il tanımlı değil.', [
      { path: 'cityCode', message: 'Geçersiz plaka kodu.' },
    ]);
  }

  const created = await insertScrapeRun(c.env.DB, input);
  return c.json(created, 201, { 'Cache-Control': 'no-store' });
});

// ─── Eczaneler ──────────────────────────────────────────────────────────────

adminRoutes.get('/pharmacies', validate('query', adminPharmaciesQuery), async (c) => {
  const q = c.req.valid('query');
  const result = await listPharmacies(c.env.DB, {
    ...(q.q ? { q: q.q } : {}),
    ...(q.city === undefined ? {} : { cityCode: q.city }),
    ...(q.district ? { districtCode: q.district } : {}),
    limit: q.limit,
    offset: q.offset,
  });
  return c.json(result, 200, { 'Cache-Control': 'no-store' });
});

adminRoutes.post('/pharmacies', validate('json', pharmacyInput), async (c) => {
  const input = c.req.valid('json');

  if (!(await districtExists(c.env.DB, input.districtCode))) {
    throw badRequest('Böyle bir ilçe yok.', [
      { path: 'districtCode', message: 'Geçersiz ilçe kodu.' },
    ]);
  }

  let created: AdminPharmacy | null;
  try {
    created = await insertPharmacy(c.env.DB, {
      ...input,
      phone: normalizePhone(input.phone),
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict('Bu ilçede aynı adlı bir eczane zaten kayıtlı.');
    }
    throw e;
  }

  if (!created) throw internal('Eczane kaydedilemedi.');

  await audit(c.env.DB, c.get('adminUser'), 'pharmacy.create', created.id, {
    name: created.name,
  });
  return c.json(created, 201);
});

adminRoutes.patch(
  '/pharmacies/:id',
  validate('param', idParam),
  validate('json', pharmacyInput),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    if (!(await districtExists(c.env.DB, input.districtCode))) {
      throw badRequest('Böyle bir ilçe yok.', [
        { path: 'districtCode', message: 'Geçersiz ilçe kodu.' },
      ]);
    }

    let updated: AdminPharmacy | null;
    try {
      updated = await updatePharmacy(c.env.DB, id, {
        ...input,
        phone: normalizePhone(input.phone),
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('Bu ilçede aynı adlı bir eczane zaten kayıtlı.');
      }
      throw e;
    }

    if (!updated) throw notFound('Eczane bulunamadı.');

    await audit(c.env.DB, c.get('adminUser'), 'pharmacy.update', id, { name: updated.name });
    return c.json(updated, 200);
  },
);

adminRoutes.delete('/pharmacies/:id', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param');
  const ok = await deletePharmacy(c.env.DB, id);
  if (!ok) throw notFound('Eczane bulunamadı.');

  await audit(c.env.DB, c.get('adminUser'), 'pharmacy.delete', id, {});
  return c.body(null, 204);
});

// ─── Nöbet atamaları ────────────────────────────────────────────────────────

// Takvim, `/duties/:id` deseninden ÖNCE tanımlanır; aksi halde "calendar"
// bir id sanılır ve param doğrulaması 400 döner.
adminRoutes.get('/duties/calendar', validate('query', dutyCalendarQuery), async (c) => {
  const { month, city } = c.req.valid('query');
  const days = await dutyCalendar(c.env.DB, month, city);
  return c.json({ month, cityCode: city ?? null, days }, 200, { 'Cache-Control': 'no-store' });
});

adminRoutes.get('/duties', validate('query', dutiesQuery), async (c) => {
  const q = c.req.valid('query');
  const day = q.date ?? dutyDateOf(new Date());

  const { total, items } = await listDutiesByDate(c.env.DB, {
    date: day,
    ...(q.city === undefined ? {} : { cityCode: q.city }),
    ...(q.district ? { districtCode: q.district } : {}),
    limit: q.limit,
    offset: q.offset,
  });

  return c.json({ date: day, total, items }, 200, { 'Cache-Control': 'no-store' });
});

adminRoutes.post('/duties', validate('json', dutyInput), async (c) => {
  const { pharmacyId, date } = c.req.valid('json');

  let created: DutyShift | null;
  try {
    created = await insertDuty(c.env.DB, pharmacyId, date, c.get('adminUser'));
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict('Bu eczane o gün için zaten nöbetçi.');
    }
    throw e;
  }

  if (!created) throw notFound('Eczane bulunamadı.');

  await audit(c.env.DB, c.get('adminUser'), 'duty.create', created.id, {
    pharmacyId,
    date,
  });
  return c.json(created, 201);
});

adminRoutes.delete('/duties/:id', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param');
  const ok = await deleteDuty(c.env.DB, id);
  if (!ok) throw notFound('Nöbet kaydı bulunamadı.');

  await audit(c.env.DB, c.get('adminUser'), 'duty.delete', id, {});
  return c.body(null, 204);
});
