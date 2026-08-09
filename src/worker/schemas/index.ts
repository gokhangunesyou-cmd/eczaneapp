/**
 * Zod şemaları — çalışma anı doğrulaması.
 *
 * Üretilen tipler (`@shared/api-types`) derleme anı içindir; bu şemalar çalışma
 * anı içindir. İkisi ayrı iştir ama SINIRLARI AYNI OLMALIDIR — buradaki her
 * min/max/pattern `contracts/openapi.yaml`'daki değerle birebir eşleşir.
 * Farklıysa sözleşme yalan söylüyor demektir.
 */

import { z } from 'zod';

// Türkiye sınırlarının kaba kutusu — openapi.yaml ile aynı.
const LAT = z.number().min(35.8).max(42.2);
const LNG = z.number().min(25.6).max(44.9);

const DISTRICT_CODE = z.string().regex(/^[0-9]{4}$/, 'İlçe kodu 4 haneli olmalı.');
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı.');

export const cityQuery = z.coerce.number().int().min(1).max(81).default(7);

/** İsteğe bağlı plaka kodu — varsayılansız. */
const OPTIONAL_CITY_AT_TOP = z.coerce.number().int().min(1).max(81).optional();

/**
 * `GET /api/pharmacies/on-duty`
 *
 * `city` BURADA VARSAYILANLI DEĞİL: verilmediğinde sunucu ili konumdan çözüyor
 * (ADR-006). Varsayılan konsaydı "il verilmedi" ile "Antalya verildi" ayırt
 * edilemezdi ve konumdan çözüm hiç çalışmazdı.
 */
export const onDutyQuery = z
  .object({
    lat: z.coerce.number().pipe(LAT).optional(),
    lng: z.coerce.number().pipe(LNG).optional(),
    district: DISTRICT_CODE.optional(),
    city: OPTIONAL_CITY_AT_TOP,
    limit: z.coerce.number().int().min(1).max(50).default(20),
    includeExpired: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'lat ve lng birlikte verilmeli.',
    path: ['lat'],
  })
  .refine((v) => !(v.lat !== undefined && v.district !== undefined), {
    message: 'Konum ve ilçe birlikte verilemez; birini seç.',
    path: ['district'],
  });

/** `GET /api/districts` */
export const districtsQuery = z.object({ city: cityQuery });

/** `POST /api/admin/session` */
export const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** `POST|PATCH /api/admin/pharmacies` */
export const pharmacyInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(32).nullable().default(null),
    address: z.string().trim().min(5).max(300),
    districtCode: DISTRICT_CODE,
    // Koordinat opsiyonel: kaynak ayrı istekle veriyor, henüz bilinmiyor olabilir
    // (ADR-005). Ama yarım koordinat kabul edilmez.
    lat: LAT.nullable().default(null),
    lng: LNG.nullable().default(null),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .refine((v) => (v.lat === null) === (v.lng === null), {
    message: 'Enlem ve boylam birlikte girilmeli ya da ikisi de boş bırakılmalı.',
    path: ['lat'],
  });

/** İsteğe bağlı plaka kodu — panel filtrelerinde tekrar eden parça. */
const OPTIONAL_CITY = z.coerce.number().int().min(1).max(81).optional();

/** `GET /api/admin/pharmacies` */
export const adminPharmaciesQuery = z.object({
  q: z.string().trim().max(120).optional(),
  city: OPTIONAL_CITY,
  district: DISTRICT_CODE.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** `GET /api/admin/duties` */
export const dutiesQuery = z.object({
  date: DATE.optional(),
  city: OPTIONAL_CITY,
  district: DISTRICT_CODE.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** `GET /api/admin/duties/calendar` */
export const dutyCalendarQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Ay YYYY-AA biçiminde olmalı.'),
  city: OPTIONAL_CITY,
});

/** `POST /api/admin/duties` */
export const dutyInput = z.object({
  pharmacyId: z.coerce.number().int().min(1),
  date: DATE,
});

/** `GET /api/admin/known-coords` */
export const knownCoordsQuery = z.object({
  city: z.coerce.number().int().min(1).max(81),
  slugs: z
    .string()
    .max(20_000)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

/** `POST /api/admin/import` — çekim komutunun yazma gövdesi (ADR-005). */
export const importBody = z.object({
  cityCode: z.coerce.number().int().min(1).max(81),
  dutyDate: DATE,
  source: z.literal('edevlet'),
  items: z
    .array(
      z
        .object({
          slug: z.string().min(3).max(200),
          name: z.string().trim().min(1).max(120),
          districtName: z.string().trim().min(1).max(80),
          districtSlug: z.string().trim().min(1).max(80),
          address: z.string().trim().min(3).max(300),
          phone: z.string().trim().max(32).nullable(),
          dutyStart: z.string().datetime(),
          dutyEnd: z.string().datetime(),
          lat: LAT.nullable(),
          lng: LNG.nullable(),
          sourceStatus: z.string().max(80).nullable().default(null),
        })
        // Yarım koordinat anlamsız — DB CHECK ile aynı kural.
        .refine((v) => (v.lat === null) === (v.lng === null), {
          message: 'lat ve lng birlikte dolu ya da birlikte boş olmalı.',
          path: ['lat'],
        })
        .refine((v) => v.dutyEnd > v.dutyStart, {
          message: 'Nöbet bitişi başlangıcından sonra olmalı.',
          path: ['dutyEnd'],
        }),
    )
    .min(1)
    .max(500),
});

// ─── Çekim koşuları (ADR-006) ───────────────────────────────────────────────

/**
 * D1'e giren zaman damgası MİLİSANİYESİZ olmalı (CLAUDE.md kota kuralı):
 * karşılaştırmalar metin üzerinden yapılıyor, `.000Z` eki sıralamayı bozar.
 */
const ISO_SECONDS = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'Zaman YYYY-AA-GGTSS:DD:SSZ biçiminde olmalı.');

/** `POST /api/admin/scrape/trigger` */
export const scrapeTriggerBody = z.object({
  scope: z
    .string()
    .regex(/^(tum|[1-9][0-9]?)$/, 'Kapsam "tum" ya da plaka kodu olmalı.')
    .default('tum'),
  days: z.enum(['bugun', 'yarin', 'ikisi']).default('ikisi'),
});

/** `GET /api/admin/scrape/runs` */
export const scrapeRunsQuery = z.object({
  city: z.coerce.number().int().min(1).max(81).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** `POST /api/admin/scrape/runs` */
export const scrapeRunInput = z.object({
  cityCode: z.coerce.number().int().min(1).max(81),
  dutyDate: DATE,
  startedAt: ISO_SECONDS,
  outcome: z.enum(['ok', 'partial', 'error']),
  rowsFound: z.coerce.number().int().min(0).default(0),
  pharmaciesNew: z.coerce.number().int().min(0).default(0),
  dutiesWritten: z.coerce.number().int().min(0).default(0),
  coordsFetched: z.coerce.number().int().min(0).default(0),
  rowsSkipped: z.coerce.number().int().min(0).default(0),
  errorMessage: z.string().max(500).nullable().default(null),
});

// ─── Tanı ucu (ADR-007) ─────────────────────────────────────────────────────

/**
 * Hedefe İLETİLMEYECEK başlıklar.
 *
 * `host` yönlendirmeyi bozar, `content-length` gövdeden hesaplanır. İkisini de
 * elle geçirmek yanıltıcı sonuç üretir; sessizce düşürmek yerine reddedilir ki
 * kullanıcı neden dikkate alınmadığını bilsin.
 */
const FORBIDDEN_PROBE_HEADERS = new Set(['host', 'content-length']);

const PROBE_HEADER = z.object({
  name: z.string().trim().min(1).max(128),
  value: z.string().max(1024),
});

/** `POST /api/admin/probe` */
export const probeBody = z
  .object({
    url: z.string().trim().max(2048),
    method: z.enum(['GET', 'POST']).default('GET'),
    headers: z.array(PROBE_HEADER).max(20).default([]),
    body: z.string().max(8192).nullable().default(null),
  })
  .refine(
    (v) => {
      try {
        const u = new URL(v.url);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Adres http:// ya da https:// ile başlayan geçerli bir URL olmalı.', path: ['url'] },
  )
  .refine((v) => v.method === 'POST' || v.body === null || v.body === '', {
    message: 'Gövde yalnızca POST ile gönderilebilir.',
    path: ['body'],
  })
  .refine((v) => v.headers.every((h) => !FORBIDDEN_PROBE_HEADERS.has(h.name.toLowerCase())), {
    message: 'host ve content-length başlıkları elle verilemez.',
    path: ['headers'],
  });

/** Yol parametresi: sayısal id */
export const idParam = z.object({ id: z.coerce.number().int().min(1) });

/**
 * Telefonu E.164'e normalize eder. Panelde serbest biçimde girilebilsin diye
 * (`0242 237 14 14`), ama `tel:` bağlantısında çalışsın diye.
 * Çözülemeyen girdiyi olduğu gibi bırakır — veri kaybetmektense ham tutmak iyi.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length === 11) return `+9${digits}`;
  if (digits.length === 10) return `+90${digits}`;
  return raw.trim() || null;
}
