/**
 * MCP Server Data & Service Layer
 * Fetches duty pharmacies, lists cities and districts, and formats navigation links.
 */

import { slugify } from '../shared/slug';

export interface PharmacyDutyItem {
  id: string;
  name: string;
  phone: string;
  callUrl: string;
  address: string;
  districtCode: string;
  districtName: string;
  cityCode: number;
  lat: number;
  lng: number;
  dutyStart: string;
  dutyEnd: string;
  status: 'open' | 'closed';
  minutesUntilClose?: number;
  distanceM?: number | null;
  etaMin?: number | null;
  directions: {
    googleMaps: string;
    appleMaps: string;
    yandexMaps: string;
    waze: string;
  };
}

export interface DutyPharmacyResult {
  cityCode: number;
  cityName?: string;
  districtCode?: string;
  districtName?: string;
  stale: boolean;
  dataAsOf: string;
  nextRotationAt: string;
  count: number;
  items: PharmacyDutyItem[];
}

export interface CityItem {
  code: number;
  name: string;
  slug: string;
  districtCount: number;
}

export interface DistrictItem {
  code: string;
  name: string;
  slug: string;
  dutyCount: number;
}

export const CITIES_MAP: Record<number, { name: string; slug: string }> = {
  1: { name: 'Adana', slug: 'adana' },
  2: { name: 'Adıyaman', slug: 'adiyaman' },
  3: { name: 'Afyonkarahisar', slug: 'afyonkarahisar' },
  4: { name: 'Ağrı', slug: 'agri' },
  5: { name: 'Amasya', slug: 'amasya' },
  6: { name: 'Ankara', slug: 'ankara' },
  7: { name: 'Antalya', slug: 'antalya' },
  8: { name: 'Artvin', slug: 'artvin' },
  9: { name: 'Aydın', slug: 'aydin' },
  10: { name: 'Balıkesir', slug: 'balikesir' },
  11: { name: 'Bilecik', slug: 'bilecik' },
  12: { name: 'Bingöl', slug: 'bingol' },
  13: { name: 'Bitlis', slug: 'bitlis' },
  14: { name: 'Bolu', slug: 'bolu' },
  15: { name: 'Burdur', slug: 'burdur' },
  16: { name: 'Bursa', slug: 'bursa' },
  17: { name: 'Çanakkale', slug: 'canakkale' },
  18: { name: 'Çankırı', slug: 'cankiri' },
  19: { name: 'Çorum', slug: 'corum' },
  20: { name: 'Denizli', slug: 'denizli' },
  21: { name: 'Diyarbakır', slug: 'diyarbakir' },
  22: { name: 'Edirne', slug: 'edirne' },
  23: { name: 'Elazığ', slug: 'elazig' },
  24: { name: 'Erzincan', slug: 'erzincan' },
  25: { name: 'Erzurum', slug: 'erzurum' },
  26: { name: 'Eskişehir', slug: 'eskisehir' },
  27: { name: 'Gaziantep', slug: 'gaziantep' },
  28: { name: 'Giresun', slug: 'giresun' },
  29: { name: 'Gümüşhane', slug: 'gumushane' },
  30: { name: 'Hakkari', slug: 'hakkari' },
  31: { name: 'Hatay', slug: 'hatay' },
  32: { name: 'Isparta', slug: 'isparta' },
  33: { name: 'Mersin', slug: 'mersin' },
  34: { name: 'İstanbul', slug: 'istanbul' },
  35: { name: 'İzmir', slug: 'izmir' },
  36: { name: 'Kars', slug: 'kars' },
  37: { name: 'Kastamonu', slug: 'kastamonu' },
  38: { name: 'Kayseri', slug: 'kayseri' },
  39: { name: 'Kırklareli', slug: 'kirklareli' },
  40: { name: 'Kırşehir', slug: 'kirsehir' },
  41: { name: 'Kocaeli', slug: 'kocaeli' },
  42: { name: 'Konya', slug: 'konya' },
  43: { name: 'Kütahya', slug: 'kutahya' },
  44: { name: 'Malatya', slug: 'malatya' },
  45: { name: 'Manisa', slug: 'manisa' },
  46: { name: 'Kahramanmaraş', slug: 'kahramanmaras' },
  47: { name: 'Mardin', slug: 'mardin' },
  48: { name: 'Muğla', slug: 'mugla' },
  49: { name: 'Muş', slug: 'mus' },
  50: { name: 'Nevşehir', slug: 'nevsehir' },
  51: { name: 'Niğde', slug: 'nigde' },
  52: { name: 'Ordu', slug: 'ordu' },
  53: { name: 'Rize', slug: 'rize' },
  54: { name: 'Sakarya', slug: 'sakarya' },
  55: { name: 'Samsun', slug: 'samsun' },
  56: { name: 'Siirt', slug: 'siirt' },
  57: { name: 'Sinop', slug: 'sinop' },
  58: { name: 'Sivas', slug: 'sivas' },
  59: { name: 'Tekirdağ', slug: 'tekirdag' },
  60: { name: 'Tokat', slug: 'tokat' },
  61: { name: 'Trabzon', slug: 'trabzon' },
  62: { name: 'Tunceli', slug: 'tunceli' },
  63: { name: 'Şanlıurfa', slug: 'sanliurfa' },
  64: { name: 'Uşak', slug: 'usak' },
  65: { name: 'Van', slug: 'van' },
  66: { name: 'Yozgat', slug: 'yozgat' },
  67: { name: 'Zonguldak', slug: 'zonguldak' },
  68: { name: 'Aksaray', slug: 'aksaray' },
  69: { name: 'Bayburt', slug: 'bayburt' },
  70: { name: 'Karaman', slug: 'karaman' },
  71: { name: 'Kırıkkale', slug: 'kirikkale' },
  72: { name: 'Batman', slug: 'batman' },
  73: { name: 'Şırnak', slug: 'sirnak' },
  74: { name: 'Bartın', slug: 'bartin' },
  75: { name: 'Ardahan', slug: 'ardahan' },
  76: { name: 'Iğdır', slug: 'igdir' },
  77: { name: 'Yalova', slug: 'yalova' },
  78: { name: 'Karabük', slug: 'karabuk' },
  79: { name: 'Kilis', slug: 'kilis' },
  80: { name: 'Osmaniye', slug: 'osmaniye' },
  81: { name: 'Düzce', slug: 'duzce' },
};

export function getBaseApiUrl(): string {
  return process.env.NOBETCI_ECZANE_API_URL || 'https://nobetcieczane.becayisler.com';
}

/**
 * Resolves city input (code string/number or name/slug) to numeric city code (1-81).
 * Defaults to 7 (Antalya) if unresolvable.
 */
export function resolveCityCode(input?: string | number | null): number {
  if (!input) return 7;

  if (typeof input === 'number' && input >= 1 && input <= 81) {
    return input;
  }

  const str = String(input).trim();
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 1 && num <= 81) {
    return num;
  }

  const slug = slugify(str);
  for (const [codeStr, data] of Object.entries(CITIES_MAP)) {
    if (data.slug === slug) {
      return Number(codeStr);
    }
  }

  return 7;
}

/**
 * Generates map navigation links for lat/lng coordinates.
 */
export function createDirections(lat: number, lng: number) {
  const dest = `${lat},${lng}`;
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
    appleMaps: `https://maps.apple.com/?daddr=${dest}&dirflg=d`,
    yandexMaps: `https://yandex.com/maps/?rtext=~${dest}`,
    waze: `https://waze.com/ul?ll=${dest}&navigate=yes`,
  };
}

/**
 * Fetches all supported cities.
 */
export async function fetchCities(): Promise<CityItem[]> {
  const url = `${getBaseApiUrl()}/api/cities`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`API error fetching cities: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { items: CityItem[] };
  return data.items;
}

/**
 * Fetches districts for a city.
 */
export async function fetchDistricts(cityInput: string | number): Promise<DistrictItem[]> {
  const cityCode = resolveCityCode(cityInput);
  const url = `${getBaseApiUrl()}/api/districts?city=${cityCode}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`API error fetching districts: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { items: DistrictItem[] };
  return data.items;
}

/**
 * Fetches today's duty pharmacies given a city and optional district input.
 */
export async function fetchDutyPharmacies(options: {
  city?: string | number | null;
  district?: string | null;
  limit?: number;
  includeExpired?: boolean;
}): Promise<DutyPharmacyResult> {
  const cityCode = resolveCityCode(options.city);
  const cityName = CITIES_MAP[cityCode]?.name;

  let resolvedDistrictCode: string | undefined;
  let resolvedDistrictName: string | undefined;

  if (options.district) {
    const rawDistrict = options.district.trim();
    // If it looks like a 4-digit TÜİK district code
    if (/^\d{4}$/.test(rawDistrict)) {
      resolvedDistrictCode = rawDistrict;
    } else {
      // Fetch districts for city to match slug or name
      try {
        const districts = await fetchDistricts(cityCode);
        const distSlug = slugify(rawDistrict);
        const found = districts.find(
          (d) => d.code === rawDistrict || d.slug === distSlug || slugify(d.name) === distSlug,
        );
        if (found) {
          resolvedDistrictCode = found.code;
          resolvedDistrictName = found.name;
        }
      } catch {
        /* Ignore district lookup error and attempt direct query */
      }
    }
  }

  const queryParams = new URLSearchParams();
  queryParams.set('city', String(cityCode));
  if (resolvedDistrictCode) {
    queryParams.set('district', resolvedDistrictCode);
  }
  if (options.limit) {
    queryParams.set('limit', String(options.limit));
  }
  if (options.includeExpired) {
    queryParams.set('includeExpired', 'true');
  }

  const url = `${getBaseApiUrl()}/api/pharmacies/on-duty?${queryParams.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`API error fetching duty pharmacies: ${resp.status} ${resp.statusText}`);
  }

  const rawData = (await resp.json()) as {
    stale: boolean;
    dataAsOf: string;
    nextRotationAt: string;
    cityCode: number;
    items: Array<{
      id: string;
      name: string;
      phone: string;
      address: string;
      districtCode: string;
      districtName: string;
      lat: number;
      lng: number;
      dutyStart: string;
      dutyEnd: string;
      status: 'open' | 'closed';
      minutesUntilClose?: number;
      distanceM?: number | null;
      etaMin?: number | null;
    }>;
  };

  const items: PharmacyDutyItem[] = rawData.items.map((item) => ({
    ...item,
    cityCode,
    callUrl: `tel:${item.phone.replace(/\s+/g, '')}`,
    directions: createDirections(item.lat, item.lng),
  }));

  if (items.length > 0 && !resolvedDistrictName) {
    resolvedDistrictName = items[0]?.districtName;
  }

  return {
    cityCode,
    cityName,
    districtCode: resolvedDistrictCode,
    districtName: resolvedDistrictName,
    stale: rawData.stale,
    dataAsOf: rawData.dataAsOf,
    nextRotationAt: rawData.nextRotationAt,
    count: items.length,
    items,
  };
}
