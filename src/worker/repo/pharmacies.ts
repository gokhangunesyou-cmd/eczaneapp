/**
 * Eczane ve nöbet sorguları.
 *
 * Kurallar (CLAUDE.md + .claude/skills/yeni-endpoint):
 *  - Her sorgu prepare().bind() ile. String birleştirme yok.
 *  - SELECT * yok; yalnızca kullanılan sütunlar.
 *  - Her sorgu LIMIT'li.
 *  - Bu katman Response üretmez, Hono bağlamını görmez.
 */

import type { components } from '@shared/api-types';
import { haversineMeters, estimateDriveMinutes } from '@shared/geo';
import { dutyStatus, minutesUntilClose } from '@shared/duty';
import { pharmacySlug } from '@shared/slug';

const MS_DAY = 86_400_000;

export type PublicPharmacy = components['schemas']['Pharmacy'];
export type AdminPharmacy = components['schemas']['AdminPharmacy'];
export type PharmacyInput = components['schemas']['PharmacyInput'];

/** D1'den dönen ham satır. */
type DutyRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string;
  district_code: string;
  district_name: string;
  lat: number | null;
  lng: number | null;
  duty_start: string;
  duty_end: string;
};

const DUTY_COLUMNS = `
  p.id            AS id,
  p.name          AS name,
  p.phone         AS phone,
  p.address       AS address,
  p.district_code AS district_code,
  d.name          AS district_name,
  p.lat           AS lat,
  p.lng           AS lng,
  s.duty_start    AS duty_start,
  s.duty_end      AS duty_end
`;

function toPublic(row: DutyRow, now: Date, from?: { lat: number; lng: number }): PublicPharmacy {
  // Koordinatı olmayan eczanenin mesafesi hesaplanamaz — listede görünür,
  // haritada görünmez (ADR-005).
  const distanceM =
    from && row.lat !== null && row.lng !== null
      ? haversineMeters(from.lat, from.lng, row.lat, row.lng)
      : null;
  return {
    id: `manual:${row.id}`,
    name: row.name,
    phone: row.phone,
    address: row.address,
    districtCode: row.district_code,
    districtName: row.district_name,
    lat: row.lat,
    lng: row.lng,
    distanceM,
    etaMin: distanceM === null ? null : estimateDriveMinutes(distanceM),
    dutyStart: row.duty_start,
    dutyEnd: row.duty_end,
    status: dutyStatus(row.duty_end, now),
    minutesUntilClose: minutesUntilClose(row.duty_end, now),
  };
}

/**
 * Şu an nöbette olan eczaneler.
 *
 * `includeExpired` false ise yalnızca penceresi açık olanlar döner. true ise
 * bugünün nöbet gününe ait bitmiş olanlar da gelir (tasarımdaki soluk satırlar).
 */
export async function findOnDuty(
  db: D1Database,
  opts: {
    now: Date;
    cityCode: number;
    limit: number;
    includeExpired: boolean;
    near?: { lat: number; lng: number };
    districtCode?: string;
  },
): Promise<PublicPharmacy[]> {
  // Saklanan zamanlar `YYYY-MM-DDTHH:MM:SSZ`. Karşılaştırma metin üzerinden
  // yapıldığı için bağlanan değer de AYNI biçimde olmalı:
  //  - SQLite'ın datetime() fonksiyonu boşluklu biçim döndürür ('... 05:00:00')
  //    ve 'T'li biçimle sıralaması tutmaz — bu yüzden SQL'de kullanılmaz.
  //  - toISOString() milisaniye ekler ('...05:00:00.123Z'); 'Z' > '.' olduğu
  //    için rotasyon anından hemen sonra yanlış sonuç verir. Milisaniye atılır.
  const nowIso = `${opts.now.toISOString().slice(0, 19)}Z`;

  // Nöbet bitiş alt sınırı. Normalde "şu an" (yalnızca açık olanlar);
  // includeExpired ise son 24 saat (tasarımdaki soluk "Nöbeti bitti" satırları).
  // Tek bir yer tutucu kullanılır — D1 bağlama sayısı dallara göre değişemez.
  const endAfter = opts.includeExpired
    ? `${new Date(opts.now.getTime() - MS_DAY).toISOString().slice(0, 19)}Z`
    : nowIso;

  const districtClause = opts.districtCode ? 'AND p.district_code = ?5' : '';

  /**
   * Konuma göre sorguda SQL LIMIT'i İSTENEN SAYI OLAMAZ.
   *
   * Mesafe sıralaması Worker'da yapılıyor (haversine SQLite'ta yok). SQL 20
   * satırı `ORDER BY p.name` ile kesip verirse, sıralama yalnızca o alfabetik
   * ilk 20 içinde yapılır — en yakın eczane listeye hiç girmeyebilir. Ürünün
   * tek vaadi "en yakını göster" olduğu için bu sessiz bir hata olurdu.
   *
   * Bu yüzden konum varsa ilin o günkü nöbetçilerinin tamamı okunur, mesafeye
   * göre sıralanır, sonra kesilir. Üst sınır kotayı korur: bir ilde bir günde
   * nöbetçi sayısı en kalabalık ilde bile (İstanbul, ~140) bunun altında.
   */
  const CITY_DUTY_CEILING = 300;
  const sqlLimit = opts.near ? CITY_DUTY_CEILING : opts.limit;

  // `districtClause` ve `DUTY_COLUMNS` sabit metinlerdir; hiçbir kullanıcı
  // verisi SQL'e gömülmez — konum, ilçe ve limit .bind() ile geçer.
  const sql = `
    SELECT ${DUTY_COLUMNS}
    FROM duty_shift s
    JOIN pharmacy p ON p.id = s.pharmacy_id
    JOIN district d ON d.code = p.district_code
    WHERE s.duty_start <= ?1
      AND s.duty_end   >  ?4
      AND d.city_code  =  ?2
      ${districtClause}
    ORDER BY p.name
    LIMIT ?3
  `;

  const stmt = opts.districtCode
    ? db.prepare(sql).bind(nowIso, opts.cityCode, sqlLimit, endAfter, opts.districtCode)
    : db.prepare(sql).bind(nowIso, opts.cityCode, sqlLimit, endAfter);

  const { results } = await stmt.all<DutyRow>();

  const items = results.map((r) => toPublic(r, opts.now, opts.near));

  // Konum verildiyse mesafeye göre sırala. Sıralama D1'de yapılamaz —
  // haversine SQLite'ta yok. Birkaç yüz satırda ihmal edilebilir CPU.
  if (opts.near) {
    items.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
    return items.slice(0, opts.limit);
  }

  return items;
}

/** Veri tazeliği: en son giriş yapılan nöbet kaydının zamanı. */
export async function lastDutyUpdate(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT MAX(created_at) AS at FROM duty_shift LIMIT 1')
    .first<{ at: string | null }>();
  return row?.at ?? null;
}

/**
 * Bugünün nöbet günü için kayıt var mı — `stale` bayrağını belirler.
 *
 * İl verildiğinde SADECE o il sorulur: veri 81 ili kapsadığı için "herhangi bir
 * yerde bugünün verisi var" bilgisi kullanıcıya yalan söyler. Antalya'nın verisi
 * varken Konya'daki kullanıcı `stale: false` görmemeli.
 */
export async function hasDutyForDate(
  db: D1Database,
  dutyDate: string,
  cityCode?: number,
): Promise<boolean> {
  if (cityCode === undefined) {
    const row = await db
      .prepare('SELECT 1 AS ok FROM duty_shift WHERE duty_date = ?1 LIMIT 1')
      .bind(dutyDate)
      .first<{ ok: number }>();
    return row !== null;
  }

  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM duty_shift s
       JOIN pharmacy p ON p.id = s.pharmacy_id
       JOIN district d ON d.code = p.district_code
       WHERE s.duty_date = ?1 AND d.city_code = ?2
       LIMIT 1`,
    )
    .bind(dutyDate, cityCode)
    .first<{ ok: number }>();
  return row !== null;
}

// ─── Panel (ADR-004) ────────────────────────────────────────────────────────

type AdminRow = {
  id: number;
  slug: string;
  name: string;
  phone: string | null;
  address: string;
  district_code: string;
  district_name: string;
  lat: number | null;
  lng: number | null;
  coord_source: 'edevlet' | 'manual';
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const toAdmin = (r: AdminRow): AdminPharmacy => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  phone: r.phone,
  address: r.address,
  districtCode: r.district_code,
  districtName: r.district_name,
  lat: r.lat,
  lng: r.lng,
  coordSource: r.coord_source,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const ADMIN_COLUMNS = `
  p.id, p.slug, p.name, p.phone, p.address, p.district_code, d.name AS district_name,
  p.lat, p.lng, p.coord_source, p.notes, p.created_at, p.updated_at
`;

export async function listPharmacies(
  db: D1Database,
  opts: { q?: string; cityCode?: number; districtCode?: string; limit: number; offset: number },
): Promise<{ total: number; items: AdminPharmacy[] }> {
  const like = opts.q ? `%${opts.q}%` : null;

  // İl filtresi `district` üzerinden geliyor; sayım sorgusunun da aynı JOIN'i
  // yapması gerekiyor, bu yüzden ikisi de tabloları birlikte okuyor.
  const where = [
    like ? '(p.name LIKE ?1 OR p.address LIKE ?1)' : '?1 IS NULL',
    opts.districtCode ? 'p.district_code = ?2' : '?2 IS NULL',
    opts.cityCode === undefined ? '?3 IS NULL' : 'd.city_code = ?3',
  ].join(' AND ');

  const filterBinds = [like, opts.districtCode ?? null, opts.cityCode ?? null] as const;

  const countRow = await db
    .prepare(
      // eslint-disable-next-line no-restricted-syntax -- sabit koşul metni gömülüyor, kullanıcı verisi değil; değerler .bind() ile geçer
      `SELECT COUNT(*) AS n
       FROM pharmacy p JOIN district d ON d.code = p.district_code
       WHERE ${where} LIMIT 1`,
    )
    .bind(...filterBinds)
    .first<{ n: number }>();

  const { results } = await db
    .prepare(
      // eslint-disable-next-line no-restricted-syntax -- sabit sütun/koşul metni gömülüyor, kullanıcı verisi değil; değerler .bind() ile geçer
      `SELECT ${ADMIN_COLUMNS}
       FROM pharmacy p JOIN district d ON d.code = p.district_code
       WHERE ${where}
       ORDER BY d.city_code, p.name
       LIMIT ?4 OFFSET ?5`,
    )
    .bind(...filterBinds, opts.limit, opts.offset)
    .all<AdminRow>();

  return { total: countRow?.n ?? 0, items: results.map(toAdmin) };
}

export async function getPharmacy(db: D1Database, id: number): Promise<AdminPharmacy | null> {
  const row = await db
    .prepare(
      // eslint-disable-next-line no-restricted-syntax -- sabit sütun/koşul metni gömülüyor, kullanıcı verisi değil; değerler .bind() ile geçer
      `SELECT ${ADMIN_COLUMNS}
       FROM pharmacy p JOIN district d ON d.code = p.district_code
       WHERE p.id = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<AdminRow>();
  return row ? toAdmin(row) : null;
}

export async function insertPharmacy(
  db: D1Database,
  input: PharmacyInput,
): Promise<AdminPharmacy | null> {
  // Slug doğal anahtardır (ADR-005) ve `il/ilçe/eczane`'den türer — panelden
  // eklenen eczane de çekimle AYNI kimliği almalı, yoksa aynı eczane iki kez
  // kaydedilir ve nöbet ataması bölünür.
  const loc = await db
    .prepare(
      `SELECT c.slug AS city_slug, d.slug AS district_slug
       FROM district d JOIN city c ON c.code = d.city_code
       WHERE d.code = ?1 LIMIT 1`,
    )
    .bind(input.districtCode)
    .first<{ city_slug: string; district_slug: string }>();

  if (!loc) return null;

  const slug = pharmacySlug(loc.city_slug, loc.district_slug, input.name);

  const row = await db
    .prepare(
      `INSERT INTO pharmacy (slug, name, phone, address, district_code, lat, lng, notes, coord_source)
       VALUES (?8, ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'manual')
       RETURNING id`,
    )
    .bind(
      input.name,
      input.phone ?? null,
      input.address,
      input.districtCode,
      input.lat,
      input.lng,
      input.notes ?? null,
      slug,
    )
    .first<{ id: number }>();

  return row ? getPharmacy(db, row.id) : null;
}

export async function updatePharmacy(
  db: D1Database,
  id: number,
  input: PharmacyInput,
): Promise<AdminPharmacy | null> {
  const res = await db
    .prepare(
      `UPDATE pharmacy
       SET name = ?2, phone = ?3, address = ?4, district_code = ?5,
           lat = ?6, lng = ?7, notes = ?8,
           -- Panelden koordinat girildiyse artık ELLE girilmiş sayılır ve
           -- çekim onu bir daha ezmez (ADR-005).
           coord_source = CASE WHEN ?6 IS NULL THEN coord_source ELSE 'manual' END,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?1`,
    )
    .bind(
      id,
      input.name,
      input.phone ?? null,
      input.address,
      input.districtCode,
      input.lat,
      input.lng,
      input.notes ?? null,
    )
    .run();

  if (!res.meta.changes) return null;
  return getPharmacy(db, id);
}

export async function deletePharmacy(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM pharmacy WHERE id = ?1').bind(id).run();
  return res.meta.changes > 0;
}
