/**
 * API istemcisi.
 *
 * Tipler `contracts/openapi.yaml`'dan üretilir — burada elle tip YAZILMAZ.
 * Hata mesajları sunucudan Türkçe gelir ve doğrudan ekrana basılır.
 */

import type { components } from '@shared/api-types';

export type Pharmacy = components['schemas']['Pharmacy'];
export type PharmacyList = components['schemas']['PharmacyList'];
export type District = components['schemas']['District'];
export type DistrictList = components['schemas']['DistrictList'];
export type AdminPharmacy = components['schemas']['AdminPharmacy'];
export type PharmacyInput = components['schemas']['PharmacyInput'];
export type DutyShift = components['schemas']['DutyShift'];
export type Health = components['schemas']['Health'];
export type City = components['schemas']['City'];
export type CalendarDay = components['schemas']['CalendarDay'];
export type ScrapeRun = components['schemas']['ScrapeRun'];
export type ScrapeTriggerResult = components['schemas']['ScrapeTriggerResult'];

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Belirli bir alanın hata mesajı — form altında göstermek için. */
  fieldError(path: string): string | undefined {
    return this.details.find((d) => d.path === path)?.message;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Ağ tamamen yok — tasarımdaki çevrimdışı ekranı bunu yakalar.
    throw new ApiClientError(0, 'offline', 'Bağlantı yok.');
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let code = 'internal';
    let message = 'Bir şeyler ters gitti.';
    let details: { path: string; message: string }[] = [];
    try {
      const body = (await res.json()) as components['schemas']['Error'];
      code = body.error.code;
      message = body.error.message;
      details = body.error.details ?? [];
    } catch {
      /* gövde JSON değilse varsayılan mesajla devam */
    }
    throw new ApiClientError(res.status, code, message, details);
  }

  return (await res.json()) as T;
}

// ─── Genel ──────────────────────────────────────────────────────────────────

export const getHealth = () => request<Health>('/api/health');

export const getDistricts = (city?: number) =>
  request<DistrictList>(`/api/districts${city === undefined ? '' : `?city=${city}`}`);

export const getCities = () => request<{ items: City[] }>('/api/cities');

export function getOnDuty(params: {
  lat?: number;
  lng?: number;
  district?: string;
  includeExpired?: boolean;
  limit?: number;
}): Promise<PharmacyList> {
  const q = new URLSearchParams();
  if (params.lat !== undefined && params.lng !== undefined) {
    q.set('lat', String(params.lat));
    q.set('lng', String(params.lng));
  }
  if (params.district) q.set('district', params.district);
  if (params.includeExpired) q.set('includeExpired', 'true');
  if (params.limit) q.set('limit', String(params.limit));
  return request<PharmacyList>(`/api/pharmacies/on-duty?${q.toString()}`);
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export const adminLogin = (username: string, password: string) =>
  request<void>('/api/admin/session', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const adminLogout = () => request<void>('/api/admin/session', { method: 'DELETE' });

export const adminMe = () => request<{ username: string; expiresAt: string }>('/api/admin/me');

export function adminListPharmacies(
  params: { q?: string; city?: number; district?: string; limit?: number; offset?: number } = {},
) {
  const s = new URLSearchParams();
  if (params.q) s.set('q', params.q);
  if (params.city !== undefined) s.set('city', String(params.city));
  if (params.district) s.set('district', params.district);
  if (params.limit !== undefined) s.set('limit', String(params.limit));
  if (params.offset) s.set('offset', String(params.offset));
  return request<{ total: number; items: AdminPharmacy[] }>(
    `/api/admin/pharmacies?${s.toString()}`,
  );
}

export const adminCreatePharmacy = (input: PharmacyInput) =>
  request<AdminPharmacy>('/api/admin/pharmacies', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const adminUpdatePharmacy = (id: number, input: PharmacyInput) =>
  request<AdminPharmacy>(`/api/admin/pharmacies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const adminDeletePharmacy = (id: number) =>
  request<void>(`/api/admin/pharmacies/${id}`, { method: 'DELETE' });

export function adminListDuties(
  params: { date?: string; city?: number; district?: string; limit?: number; offset?: number } = {},
) {
  const s = new URLSearchParams();
  if (params.date) s.set('date', params.date);
  if (params.city !== undefined) s.set('city', String(params.city));
  if (params.district) s.set('district', params.district);
  if (params.limit !== undefined) s.set('limit', String(params.limit));
  if (params.offset) s.set('offset', String(params.offset));
  return request<{ date: string; total: number; items: DutyShift[] }>(
    `/api/admin/duties?${s.toString()}`,
  );
}

/** Takvim ızgarasının veri kaynağı: ayın hangi gününde kaç nöbet var. */
export function adminDutyCalendar(month: string, city?: number) {
  const s = new URLSearchParams({ month });
  if (city !== undefined) s.set('city', String(city));
  return request<{ month: string; cityCode: number | null; days: CalendarDay[] }>(
    `/api/admin/duties/calendar?${s.toString()}`,
  );
}

export const adminListScrapeRuns = (params: { city?: number; limit?: number } = {}) => {
  const s = new URLSearchParams();
  if (params.city !== undefined) s.set('city', String(params.city));
  if (params.limit !== undefined) s.set('limit', String(params.limit));
  return request<{ items: ScrapeRun[] }>(`/api/admin/scrape/runs?${s.toString()}`);
};

export const adminTriggerScrape = (scope = 'tum', days: 'bugun' | 'yarin' | 'ikisi' = 'ikisi') =>
  request<ScrapeTriggerResult>('/api/admin/scrape/trigger', {
    method: 'POST',
    body: JSON.stringify({ scope, days }),
  });

export const adminCreateDuty = (pharmacyId: number, date: string) =>
  request<DutyShift>('/api/admin/duties', {
    method: 'POST',
    body: JSON.stringify({ pharmacyId, date }),
  });

export const adminDeleteDuty = (id: number) =>
  request<void>(`/api/admin/duties/${id}`, { method: 'DELETE' });
