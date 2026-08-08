/**
 * `eczaneler-parse.mjs` için tip bildirimi (ADR-007).
 *
 * Ayrıştırıcı düz JS: Node onu doğrudan çalıştırıyor, derleme adımı yok. Tipler
 * yine de yazılıyor çünkü TypeScript tarafındaki uçtan uca test
 * (`src/worker/routes/scrape-import.test.ts`) bu modülü kullanıyor ve `any`
 * üzerinden geçen bir test, alan adı değiştiğinde sessizce geçmeye devam eder.
 */

/** Kaynak yanıtından çıkarılan ham kayıt — henüz doğrulanmadı. */
export interface ScrapedRow {
  index: number;
  name: string;
  districtName: string;
  address: string;
  /** Kaynağın tarif notu, örn. `(PTT yanı)`. Yoksa boş dize. */
  hint: string;
  phoneRaw: string;
  lat: number | null;
  lng: number | null;
}

/** `POST /api/admin/import` gövdesindeki `items` öğesi. */
export interface ImportItem {
  slug: string;
  name: string;
  districtName: string;
  districtSlug: string;
  address: string;
  phone: string | null;
  dutyStart: string;
  dutyEnd: string;
  sourceStatus: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SkippedRow {
  index: number;
  name: string;
  reason: string;
}

export interface CityRef {
  code: number;
  name: string;
  slug: string;
}

export function stripTags(s: string): string;
export function parseHeaderDate(html: string, now: Date): string | null;
export function normalizePhone(raw: string): string | null;
export function trimAddressTail(address: string, districtName: string, cityName: string): string;
export function parseCity(html: string, cityName: string): ScrapedRow[];
export function toImportItems(
  rows: ScrapedRow[],
  city: CityRef,
  dutyDate: string,
): { items: ImportItem[]; skipped: SkippedRow[]; duplicates: number };
