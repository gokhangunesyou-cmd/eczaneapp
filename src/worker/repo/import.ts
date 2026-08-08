/**
 * Toplu içe aktarma — çekim komutunun yazma yolu (ADR-005).
 *
 * Buradaki üç kural ürünün doğruluğunu taşıyor:
 *  1. Eczane kimliği **slug**'dır. Aynı slug tekrar gelirse yeni kayıt açılmaz.
 *  2. `coord_source = 'manual'` olan koordinat **asla ezilmez** — panelden yapılan
 *     düzeltme kaynağın hatasından üstündür.
 *  3. O güne ait önceki `source='edevlet'` nöbetleri silinip yeniden yazılır, ama
 *     `source='manual'` olanlara dokunulmaz. Böylece kaynaktan çıkarılan bir
 *     eczane bizde asılı kalmaz, elle eklenen de kaybolmaz.
 */

import type { components } from '@shared/api-types';

export type ImportRequest = components['schemas']['ImportRequest'];
export type ImportItem = components['schemas']['ImportItem'];
export type ImportResult = components['schemas']['ImportResult'];
export type City = components['schemas']['City'];

export async function listCities(db: D1Database): Promise<City[]> {
  const { results } = await db
    .prepare(
      `SELECT c.code, c.name, c.slug, COUNT(d.code) AS district_count
       FROM city c
       LEFT JOIN district d ON d.city_code = c.code
       GROUP BY c.code, c.name, c.slug
       ORDER BY c.code
       LIMIT 100`,
    )
    .all<{ code: number; name: string; slug: string; district_count: number }>();

  return results.map((r) => ({
    code: r.code,
    name: r.name,
    slug: r.slug,
    districtCount: r.district_count,
  }));
}

export async function cityExists(db: D1Database, code: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM city WHERE code = ?1 LIMIT 1')
    .bind(code)
    .first<{ ok: number }>();
  return row !== null;
}

/**
 * Verilen slug'lardan koordinatı DOLU olanlar.
 * Çekim komutu bunları harita isteğinden muaf tutar.
 */
export async function knownCoordSlugs(
  db: D1Database,
  cityCode: number,
  slugs: string[],
): Promise<string[]> {
  if (slugs.length === 0) return [];

  const found: string[] = [];

  // D1'in SQL değişken sınırına takılmamak için parçalara böl.
  const CHUNK = 80;
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const holes = chunk.map((_, j) => `?${j + 2}`).join(',');

    // eslint-disable-next-line no-restricted-syntax -- `holes` yalnızca ?N yer tutucularından oluşur, kullanıcı verisi değil
    const sql = `SELECT p.slug
       FROM pharmacy p JOIN district d ON d.code = p.district_code
       WHERE d.city_code = ?1 AND p.lat IS NOT NULL AND p.slug IN (${holes})
       LIMIT ${CHUNK}`;

    const { results } = await db
      .prepare(sql)
      .bind(cityCode, ...chunk)
      .all<{ slug: string }>();

    for (const r of results) found.push(r.slug);
  }

  return found;
}

/**
 * Tek çağrıda ilçe + eczane + nöbet yazımı.
 *
 * D1 işlem (transaction) desteklemediği için `batch()` kullanılır — batch tek
 * bir işlem olarak çalışır, biri patlarsa hiçbiri uygulanmaz.
 */
export async function importDuties(
  db: D1Database,
  reqIn: ImportRequest,
  actor: string,
): Promise<ImportResult> {
  let req = reqIn;
  // İstemciye güvenilmez: aynı slug iki kez gelirse UNIQUE kısıtı patlar ve
  // 500 döneriz. Kaynak gerçekten mükerrer satır üretiyor (ADR-005), bu yüzden
  // burada da tekilleştirilir — ilk kayıt kazanır.
  const seen = new Set<string>();
  req = {
    ...req,
    items: req.items.filter((i) => (seen.has(i.slug) ? false : (seen.add(i.slug), true))),
  };

  const citySlugRow = await db
    .prepare('SELECT slug FROM city WHERE code = ?1 LIMIT 1')
    .bind(req.cityCode)
    .first<{ slug: string }>();
  if (!citySlugRow) throw new Error('city_not_found');

  // ─── 1. İlçeler ──────────────────────────────────────────────────────────
  const { results: existingDistricts } = await db
    .prepare('SELECT code, slug FROM district WHERE city_code = ?1 LIMIT 200')
    .bind(req.cityCode)
    .all<{ code: string; slug: string }>();

  const districtBySlug = new Map(existingDistricts.map((d) => [d.slug, d.code]));
  let districtsCreated = 0;

  const newDistricts = [...new Set(req.items.map((i) => i.districtSlug))].filter(
    (s) => !districtBySlug.has(s),
  );

  if (newDistricts.length > 0) {
    const stmts = newDistricts.map((slug) => {
      const item = req.items.find((i) => i.districtSlug === slug)!;
      // Kaynak ilçe kodu vermiyor; kendi kodumuzu üretiyoruz: `<plaka>-<slug>`.
      const code = `${req.cityCode}-${slug}`.slice(0, 40);
      districtBySlug.set(slug, code);
      return db
        .prepare(
          `INSERT INTO district (code, city_code, name, slug, sort_order)
           VALUES (?1, ?2, ?3, ?4, 999)
           ON CONFLICT (city_code, slug) DO NOTHING`,
        )
        .bind(code, req.cityCode, item.districtName, slug);
    });
    await db.batch(stmts);
    districtsCreated = newDistricts.length;
  }

  // ─── 2. Eczaneler ────────────────────────────────────────────────────────
  const slugs = req.items.map((i) => i.slug);
  const existingBySlug = new Map<
    string,
    { id: number; lat: number | null; coord_source: string }
  >();

  const CHUNK = 80;
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const holes = chunk.map((_, j) => `?${j + 1}`).join(',');
    // eslint-disable-next-line no-restricted-syntax -- `holes` yalnızca ?N yer tutucularından oluşur, kullanıcı verisi değil
    const sql = `SELECT id, slug, lat, coord_source FROM pharmacy WHERE slug IN (${holes}) LIMIT ${CHUNK}`;
    const { results } = await db
      .prepare(sql)
      .bind(...chunk)
      .all<{ id: number; slug: string; lat: number | null; coord_source: string }>();
    for (const r of results) {
      existingBySlug.set(r.slug, { id: r.id, lat: r.lat, coord_source: r.coord_source });
    }
  }

  let pharmaciesCreated = 0;
  let pharmaciesUpdated = 0;
  let coordsPreserved = 0;

  const pharmacyStmts: D1PreparedStatement[] = [];

  for (const item of req.items) {
    const districtCode = districtBySlug.get(item.districtSlug);
    if (!districtCode) continue; // ilçe eklenemediyse atla

    const existing = existingBySlug.get(item.slug);

    if (!existing) {
      pharmaciesCreated++;
      pharmacyStmts.push(
        db
          .prepare(
            `INSERT INTO pharmacy (slug, name, phone, address, district_code, lat, lng, coord_source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'edevlet')`,
          )
          .bind(item.slug, item.name, item.phone, item.address, districtCode, item.lat, item.lng),
      );
      continue;
    }

    pharmaciesUpdated++;

    // Elle girilen koordinat KORUNUR (ADR-005).
    const keepCoords = existing.coord_source === 'manual';
    if (keepCoords && item.lat !== null) coordsPreserved++;

    // Kaynak koordinat vermediyse mevcut olanı silme.
    const writeCoords = !keepCoords && item.lat !== null && item.lng !== null;

    pharmacyStmts.push(
      writeCoords
        ? db
            .prepare(
              `UPDATE pharmacy
               SET name = ?2, phone = ?3, address = ?4, district_code = ?5,
                   lat = ?6, lng = ?7,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
               WHERE id = ?1`,
            )
            .bind(
              existing.id,
              item.name,
              item.phone,
              item.address,
              districtCode,
              item.lat,
              item.lng,
            )
        : db
            .prepare(
              `UPDATE pharmacy
               SET name = ?2, phone = ?3, address = ?4, district_code = ?5,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
               WHERE id = ?1`,
            )
            .bind(existing.id, item.name, item.phone, item.address, districtCode),
    );
  }

  if (pharmacyStmts.length > 0) await db.batch(pharmacyStmts);

  // ─── 3. Nöbetler ─────────────────────────────────────────────────────────
  // Kaynaktan çıkarılan eczane bizde asılı kalmasın diye o günün edevlet
  // kayıtları silinip yeniden yazılır. Elle eklenenlere dokunulmaz.
  const removed = await db
    .prepare(
      `DELETE FROM duty_shift
       WHERE duty_date = ?1
         AND source = 'edevlet'
         AND pharmacy_id IN (
           SELECT p.id FROM pharmacy p
           JOIN district d ON d.code = p.district_code
           WHERE d.city_code = ?2
         )`,
    )
    .bind(req.dutyDate, req.cityCode)
    .run();

  // Yeni id'leri almak için slug→id haritasını tazele.
  const idBySlug = new Map<string, number>();
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const holes = chunk.map((_, j) => `?${j + 1}`).join(',');
    // eslint-disable-next-line no-restricted-syntax -- `holes` yalnızca ?N yer tutucularından oluşur, kullanıcı verisi değil
    const sql = `SELECT id, slug FROM pharmacy WHERE slug IN (${holes}) LIMIT ${CHUNK}`;
    const { results } = await db
      .prepare(sql)
      .bind(...chunk)
      .all<{ id: number; slug: string }>();
    for (const r of results) idBySlug.set(r.slug, r.id);
  }

  const dutyStmts = req.items
    .map((item) => {
      const id = idBySlug.get(item.slug);
      if (!id) return null;
      return db
        .prepare(
          `INSERT INTO duty_shift
             (pharmacy_id, duty_date, duty_start, duty_end, source_status, source, created_by)
           VALUES (?1, ?2, ?3, ?4, ?5, 'edevlet', ?6)
           ON CONFLICT (duty_date, pharmacy_id) DO UPDATE SET
             duty_start = excluded.duty_start,
             duty_end   = excluded.duty_end,
             source_status = excluded.source_status`,
        )
        .bind(id, req.dutyDate, item.dutyStart, item.dutyEnd, item.sourceStatus ?? null, actor);
    })
    .filter((s): s is D1PreparedStatement => s !== null);

  if (dutyStmts.length > 0) await db.batch(dutyStmts);

  return {
    districtsCreated,
    pharmaciesCreated,
    pharmaciesUpdated,
    dutiesWritten: dutyStmts.length,
    dutiesRemoved: removed.meta.changes,
    coordsPreserved,
  };
}
