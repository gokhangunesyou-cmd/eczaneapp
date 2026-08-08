/** İlçe listesi ve ilçe başına nöbetçi sayısı. */

import type { components } from '@shared/api-types';

export type District = components['schemas']['District'];

type Row = { code: string; name: string; on_duty_count: number };

/**
 * İlçeler ve o an nöbette olan eczane sayıları.
 * Nöbetçisi olmayan ilçeler de döner (`onDutyCount: 0`) — tasarım ekranı 06
 * tüm ilçeleri listeliyor.
 */
export async function listDistricts(
  db: D1Database,
  cityCode: number,
  now: Date,
): Promise<District[]> {
  // Saklanan zamanlar `YYYY-MM-DDTHH:MM:SSZ` — milisaniyeli biçim metin
  // karşılaştırmasında rotasyon anında yanlış sonuç verir ('Z' > '.').
  const nowIso = `${now.toISOString().slice(0, 19)}Z`;
  const { results } = await db
    .prepare(
      `SELECT d.code, d.name,
              COUNT(s.id) AS on_duty_count
       FROM district d
       LEFT JOIN pharmacy p   ON p.district_code = d.code
       LEFT JOIN duty_shift s ON s.pharmacy_id = p.id
                             AND s.duty_start <= ?2
                             AND s.duty_end   >  ?2
       WHERE d.city_code = ?1
       GROUP BY d.code, d.name, d.sort_order
       ORDER BY d.sort_order
       LIMIT 100`,
    )
    .bind(cityCode, nowIso)
    .all<Row>();

  return results.map((r) => ({
    code: r.code,
    name: r.name,
    onDutyCount: r.on_duty_count,
  }));
}

export async function districtExists(db: D1Database, code: string): Promise<boolean> {
  return (await cityOfDistrict(db, code)) !== null;
}

/** İlçenin bağlı olduğu il. İlçe verilip il verilmediğinde ili buradan çözülür. */
export async function cityOfDistrict(db: D1Database, code: string): Promise<number | null> {
  const row = await db
    .prepare('SELECT city_code FROM district WHERE code = ?1 LIMIT 1')
    .bind(code)
    .first<{ city_code: number }>();
  return row?.city_code ?? null;
}
