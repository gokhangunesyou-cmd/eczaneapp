/**
 * Nöbet penceresi ve durum hesapları.
 *
 * Hem Worker hem arayüz kullanır — DOM ve Workers API'lerine dokunmaz.
 *
 * Türkiye kalıcı olarak UTC+3'tür ve yaz saati uygulaması yoktur; bu yüzden
 * sabit ofset güvenlidir. Nöbet her gün 08:00 TRT'de (05:00 UTC) döner.
 */

export const TRT_OFFSET_HOURS = 3;
export const ROTATION_HOUR_TRT = 8;

/** 08:00 TRT'nin UTC karşılığı: 05:00Z */
const ROTATION_HOUR_UTC = ROTATION_HOUR_TRT - TRT_OFFSET_HOURS;

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** `closing_soon` eşiği — tasarımda turuncu varyanta geçiş noktası. */
export const CLOSING_SOON_MINUTES = 120;

export type DutyStatus = 'open' | 'closing_soon' | 'closed';

/**
 * Verilen ana ait nöbet gününü döndürür (`YYYY-MM-DD`, TRT takvimi).
 * 08:00 TRT'den önceki saatler bir önceki güne aittir.
 */
export function dutyDateOf(now: Date): string {
  const shifted = new Date(now.getTime() - ROTATION_HOUR_UTC * MS_HOUR);
  return shifted.toISOString().slice(0, 10);
}

/** Nöbet gününün başlangıç anı (UTC ISO). */
export function dutyStartOf(dutyDate: string): string {
  return `${dutyDate}T0${ROTATION_HOUR_UTC}:00:00Z`;
}

/** Nöbet gününün bitiş anı — ertesi günün 08:00 TRT'si (UTC ISO). */
export function dutyEndOf(dutyDate: string): string {
  const next = new Date(`${dutyDate}T00:00:00Z`).getTime() + MS_DAY;
  return `${new Date(next).toISOString().slice(0, 10)}T0${ROTATION_HOUR_UTC}:00:00Z`;
}

/**
 * D1'e giren zaman damgası: **milisaniyesiz** UTC (`YYYY-MM-DDTHH:MM:SSZ`).
 * Zaman karşılaştırmaları metin üzerinden yapıldığı için `.000Z` eki sıralamayı
 * bozar — CLAUDE.md kota kuralı, `docs/adr/003-veri-tazeleme.md`.
 */
export function isoSeconds(at: Date): string {
  return `${at.toISOString().slice(0, 19)}Z`;
}

/** Bir sonraki rotasyon anı — `nextRotationAt` alanını besler. */
export function nextRotationAt(now: Date): string {
  return dutyEndOf(dutyDateOf(now));
}

/** Nöbetin bitmesine kalan dakika. Bitmişse negatif. */
export function minutesUntilClose(dutyEnd: string, now: Date): number {
  return Math.round((new Date(dutyEnd).getTime() - now.getTime()) / 60_000);
}

export function dutyStatus(dutyEnd: string, now: Date): DutyStatus {
  const left = minutesUntilClose(dutyEnd, now);
  if (left <= 0) return 'closed';
  if (left <= CLOSING_SOON_MINUTES) return 'closing_soon';
  return 'open';
}

/**
 * Edge cache TTL'i: bir sonraki rotasyona kalan süre, `maxTtl` ile sınırlı.
 * Rotasyon anında bayat veri servis edilmesini engeller (ADR-003).
 */
export function cacheTtlSeconds(now: Date, maxTtl: number): number {
  const untilRotation = Math.floor(
    (new Date(nextRotationAt(now)).getTime() - now.getTime()) / 1000,
  );
  return Math.max(30, Math.min(maxTtl, untilRotation));
}

/** `2026-08-08` → `8 Ağustos` — tasarımdaki başlık biçimi. */
const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function formatTrDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  const trt = new Date(d.getTime() + TRT_OFFSET_HOURS * MS_HOUR);
  return `${trt.getUTCDate()} ${TR_MONTHS[trt.getUTCMonth()]}`;
}

/** UTC ISO → `HH:MM` TRT. Tasarımda "Sabah 08:30'a kadar açık" için. */
export function formatTrTime(iso: string): string {
  const trt = new Date(new Date(iso).getTime() + TRT_OFFSET_HOURS * MS_HOUR);
  const hh = String(trt.getUTCHours()).padStart(2, '0');
  const mm = String(trt.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
