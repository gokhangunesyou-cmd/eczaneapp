/** Nöbet atamaları — panel tarafı (ADR-004). */

import type { components } from '@shared/api-types';
import { dutyStartOf, dutyEndOf } from '@shared/duty';

export type DutyShift = components['schemas']['DutyShift'];

type DutyRow = {
  id: number;
  pharmacy_id: number;
  pharmacy_name: string;
  district_code: string;
  district_name: string;
  duty_date: string;
  duty_start: string;
  duty_end: string;
  created_at: string;
};

const COLUMNS = `
  s.id, s.pharmacy_id, p.name AS pharmacy_name,
  p.district_code, d.name AS district_name,
  s.duty_date, s.duty_start, s.duty_end, s.created_at
`;

const toDuty = (r: DutyRow): DutyShift => ({
  id: r.id,
  pharmacyId: r.pharmacy_id,
  pharmacyName: r.pharmacy_name,
  districtCode: r.district_code,
  districtName: r.district_name,
  date: r.duty_date,
  dutyStart: r.duty_start,
  dutyEnd: r.duty_end,
  createdAt: r.created_at,
});

export type DutyListOptions = {
  date: string;
  cityCode?: number;
  districtCode?: string;
  limit: number;
  offset: number;
};

/**
 * Bir günün nöbetleri, il/ilçe filtresiyle ve sayfalı.
 *
 * 81 ilde bir gün ~1500 satır ediyor; sayfasız liste hem D1 satır okuma
 * kotasını hem paneli boğar. `total` ayrı bir COUNT ile gelir — iki sorgu,
 * ikisi de indeks üzerinden.
 */
export async function listDutiesByDate(
  db: D1Database,
  opts: DutyListOptions,
): Promise<{ total: number; items: DutyShift[] }> {
  // Yer tutucular sırayla üretilir; elle numaralamak filtre eklendiğinde
  // sessizce kayar. Filtre bağlamaları listenin ve COUNT'un ORTAK ön ekidir;
  // limit/offset yalnızca listeye eklenir (D1 fazla bağlamayı hata sayar).
  const filterBinds: (string | number)[] = [opts.date];
  const where = ['s.duty_date = ?1'];

  if (opts.cityCode !== undefined) {
    filterBinds.push(opts.cityCode);
    where.push(`d.city_code = ?${filterBinds.length}`);
  }
  if (opts.districtCode !== undefined) {
    filterBinds.push(opts.districtCode);
    where.push(`p.district_code = ?${filterBinds.length}`);
  }

  const clause = where.join(' AND ');
  const limitHole = `?${filterBinds.length + 1}`;
  const offsetHole = `?${filterBinds.length + 2}`;

  const [list, count] = await db.batch<DutyRow | { n: number }>([
    db
      .prepare(
        // eslint-disable-next-line no-restricted-syntax -- sabit sütun/koşul metni ve ?N yer tutucuları gömülüyor, kullanıcı verisi değil
        `SELECT ${COLUMNS}
       FROM duty_shift s
       JOIN pharmacy p ON p.id = s.pharmacy_id
       JOIN district d ON d.code = p.district_code
       WHERE ${clause}
       ORDER BY d.city_code, d.sort_order, p.name
       LIMIT ${limitHole} OFFSET ${offsetHole}`,
      )
      .bind(...filterBinds, opts.limit, opts.offset),
    db
      .prepare(
        // eslint-disable-next-line no-restricted-syntax -- sabit koşul metni gömülüyor, kullanıcı verisi değil
        `SELECT COUNT(*) AS n
       FROM duty_shift s
       JOIN pharmacy p ON p.id = s.pharmacy_id
       JOIN district d ON d.code = p.district_code
       WHERE ${clause}
       LIMIT 1`,
      )
      .bind(...filterBinds),
  ]);

  return {
    total: (count?.results[0] as { n: number } | undefined)?.n ?? 0,
    items: ((list?.results ?? []) as DutyRow[]).map(toDuty),
  };
}

/**
 * Aylık takvim için gün başına sayılar. Tek sorgu, en fazla 31 satır.
 * Ay sınırı METİN karşılaştırmasıyla bulunur (`BETWEEN '2026-08-01' AND '2026-08-31'`);
 * SQLite `date()` fonksiyonu SQL'de kullanılmaz — CLAUDE.md kota kuralı.
 */
export async function dutyCalendar(
  db: D1Database,
  month: string,
  cityCode?: number,
): Promise<components['schemas']['CalendarDay'][]> {
  const cityClause = cityCode === undefined ? '' : 'AND d.city_code = ?3';

  // `cityClause` sabit metin; kullanıcı verisi SQL'e gömülmez, .bind() ile geçer.
  const sql = `SELECT s.duty_date AS date,
            COUNT(*) AS count,
            SUM(CASE WHEN s.source = 'edevlet' THEN 1 ELSE 0 END) AS edevlet_count,
            SUM(CASE WHEN s.source <> 'edevlet' THEN 1 ELSE 0 END) AS manual_count
     FROM duty_shift s
     JOIN pharmacy p ON p.id = s.pharmacy_id
     JOIN district d ON d.code = p.district_code
     WHERE s.duty_date >= ?1 AND s.duty_date <= ?2 ${cityClause}
     GROUP BY s.duty_date
     ORDER BY s.duty_date
     LIMIT 31`;

  const stmt =
    cityCode === undefined
      ? db.prepare(sql).bind(`${month}-01`, `${month}-31`)
      : db.prepare(sql).bind(`${month}-01`, `${month}-31`, cityCode);

  const { results } = await stmt.all<{
    date: string;
    count: number;
    edevlet_count: number;
    manual_count: number;
  }>();

  return results.map((r) => ({
    date: r.date,
    count: r.count,
    edevletCount: r.edevlet_count,
    manualCount: r.manual_count,
  }));
}

export async function getDuty(db: D1Database, id: number): Promise<DutyShift | null> {
  const row = await db
    .prepare(
      // eslint-disable-next-line no-restricted-syntax -- sabit sütun/koşul metni gömülüyor, kullanıcı verisi değil; değerler .bind() ile geçer
      `SELECT ${COLUMNS}
       FROM duty_shift s
       JOIN pharmacy p ON p.id = s.pharmacy_id
       JOIN district d ON d.code = p.district_code
       WHERE s.id = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<DutyRow>();
  return row ? toDuty(row) : null;
}

/**
 * Nöbet atar. Pencere `date` gününün 08:00 TRT'sinden ertesi gün 08:00 TRT'sine.
 * Eczane yoksa `null`; aynı gün için zaten atanmışsa D1 UNIQUE kısıtı fırlatır
 * ve route katmanı 409'a çevirir.
 */
export async function insertDuty(
  db: D1Database,
  pharmacyId: number,
  date: string,
  actor: string,
): Promise<DutyShift | null> {
  const exists = await db
    .prepare('SELECT 1 AS ok FROM pharmacy WHERE id = ?1 LIMIT 1')
    .bind(pharmacyId)
    .first<{ ok: number }>();
  if (!exists) return null;

  const row = await db
    .prepare(
      `INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, created_by)
       VALUES (?1, ?2, ?3, ?4, ?5)
       RETURNING id`,
    )
    .bind(pharmacyId, date, dutyStartOf(date), dutyEndOf(date), actor)
    .first<{ id: number }>();

  return row ? getDuty(db, row.id) : null;
}

export async function deleteDuty(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM duty_shift WHERE id = ?1').bind(id).run();
  return res.meta.changes > 0;
}
