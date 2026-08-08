/**
 * Çekim koşusu kayıtları (ADR-006).
 *
 * Çekim Cloudflare'in dışında koşar; Worker onun **defterini** tutar. Bu kayıt
 * sessiz bozulmayı yakalamak için var: `rowsFound` bir ilde birden düşerse ya da
 * `error` birikirse kaynak sayfası değişmiş demektir.
 */

import type { components } from '@shared/api-types';

export type ScrapeRun = components['schemas']['ScrapeRun'];
export type ScrapeRunInput = components['schemas']['ScrapeRunInput'];

type RunRow = {
  id: number;
  city_code: number;
  city_name: string | null;
  duty_date: string;
  started_at: string;
  finished_at: string | null;
  outcome: string;
  rows_found: number;
  pharmacies_new: number;
  duties_written: number;
  coords_fetched: number;
  rows_skipped: number;
  error_message: string | null;
};

const COLUMNS = `
  r.id, r.city_code, c.name AS city_name, r.duty_date,
  r.started_at, r.finished_at, r.outcome,
  r.rows_found, r.pharmacies_new, r.duties_written,
  r.coords_fetched, r.rows_skipped, r.error_message
`;

const toRun = (r: RunRow): ScrapeRun => ({
  id: r.id,
  cityCode: r.city_code,
  // İl silinmiş olamaz (referans veri) ama LEFT JOIN boş dönerse kod gösterilir.
  cityName: r.city_name ?? String(r.city_code),
  dutyDate: r.duty_date,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  outcome: r.outcome as ScrapeRun['outcome'],
  rowsFound: r.rows_found,
  pharmaciesNew: r.pharmacies_new,
  dutiesWritten: r.duties_written,
  coordsFetched: r.coords_fetched,
  rowsSkipped: r.rows_skipped,
  errorMessage: r.error_message,
});

/** En yeni koşu başta. `city` verilmezse tüm iller. */
export async function listScrapeRuns(
  db: D1Database,
  opts: { cityCode?: number; limit: number },
): Promise<ScrapeRun[]> {
  const where = opts.cityCode === undefined ? '' : 'WHERE r.city_code = ?2';

  const sql = `SELECT ${COLUMNS}
     FROM scrape_run r
     LEFT JOIN city c ON c.code = r.city_code
     ${where}
     ORDER BY r.id DESC
     LIMIT ?1`;

  const stmt =
    opts.cityCode === undefined
      ? db.prepare(sql).bind(opts.limit)
      : db.prepare(sql).bind(opts.limit, opts.cityCode);

  const { results } = await stmt.all<RunRow>();
  return results.map(toRun);
}

/**
 * Tamamlanmış bir koşuyu yazar. `finished_at` sunucu saatinden set edilir —
 * istemcinin saatine güvenilmez, ama `started_at` ondan gelir çünkü koşunun
 * ne kadar sürdüğünü yalnızca o bilir.
 */
export async function insertScrapeRun(db: D1Database, input: ScrapeRunInput): Promise<ScrapeRun> {
  const row = await db
    .prepare(
      `INSERT INTO scrape_run
         (city_code, duty_date, started_at, finished_at, outcome,
          rows_found, pharmacies_new, duties_written, coords_fetched,
          rows_skipped, error_message)
       VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       RETURNING id`,
    )
    .bind(
      input.cityCode,
      input.dutyDate,
      input.startedAt,
      input.outcome,
      input.rowsFound ?? 0,
      input.pharmaciesNew ?? 0,
      input.dutiesWritten ?? 0,
      input.coordsFetched ?? 0,
      input.rowsSkipped ?? 0,
      input.errorMessage ?? null,
    )
    .first<{ id: number }>();

  if (!row) throw new Error('scrape_run_insert_failed');

  const created = await getScrapeRun(db, row.id);
  if (!created) throw new Error('scrape_run_insert_failed');
  return created;
}

async function getScrapeRun(db: D1Database, id: number): Promise<ScrapeRun | null> {
  const row = await db
    .prepare(
      // eslint-disable-next-line no-restricted-syntax -- sabit sütun metni gömülüyor, kullanıcı verisi değil
      `SELECT ${COLUMNS}
       FROM scrape_run r
       LEFT JOIN city c ON c.code = r.city_code
       WHERE r.id = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<RunRow>();
  return row ? toRun(row) : null;
}

/**
 * Panelden en son ne zaman tetiklendi? Kaynağa saygı sınırı bunun üstüne kurulu.
 * Ayrı bir tablo tutulmaz — `audit_log` zaten her panel yazmasını kaydediyor.
 */
export async function lastTriggerAt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT at FROM audit_log
       WHERE action = 'scrape.trigger'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .first<{ at: string }>();
  return row?.at ?? null;
}
