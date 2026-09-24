import { slugify } from '@shared/slug';
import { CITIES_81 } from '@shared/cities';
import type { City } from './api';

export type ParsedRoute = {
  view?: 'all-cities';
  citySlug: string | null;
  districtSlug: string | null;
  pharmacyKey: string | null;
};

export function parseRouteSlugs(pathname: string, cityList: City[] = []): ParsedRoute {
  let clean = pathname.replace(/^\//, '').replace(/\/$/, '');
  if (!clean) return { citySlug: null, districtSlug: null, pharmacyKey: null };

  if (clean === 'iller' || clean === 'tum-iller') {
    return { view: 'all-cities', citySlug: null, districtSlug: null, pharmacyKey: null };
  }

  const isPharmacyProfile = clean.endsWith('-eczanesi');
  if (isPharmacyProfile) {
    clean = clean.replace(/-eczanesi$/, '');
  } else {
    clean = clean.replace(/-nobetci-eczane$/, '');
  }

  if (clean.includes('/')) {
    const parts = clean.split('/');
    return {
      citySlug: parts[0] ?? null,
      districtSlug: parts[1] ?? null,
      pharmacyKey: parts[2] ?? null,
    };
  }

  const effectiveList: (City | { code: number; name: string; slug: string })[] =
    cityList.length > 0 ? cityList : CITIES_81;

  const exactCity = effectiveList.find((c) => c.slug === clean || slugify(c.name) === clean);
  if (exactCity) {
    return { citySlug: exactCity.slug, districtSlug: null, pharmacyKey: null };
  }

  for (const c of effectiveList) {
    const cSlug = c.slug || slugify(c.name);
    if (clean.startsWith(`${cSlug}-`)) {
      const remainder = clean.slice(cSlug.length + 1);
      if (isPharmacyProfile && remainder.includes('-')) {
        const firstDashIdx = remainder.indexOf('-');
        const districtSlug = remainder.slice(0, firstDashIdx);
        const pharmacyKey = remainder.slice(firstDashIdx + 1);
        return { citySlug: cSlug, districtSlug, pharmacyKey };
      }
      return { citySlug: cSlug, districtSlug: remainder, pharmacyKey: null };
    }
  }

  return { citySlug: clean, districtSlug: null, pharmacyKey: null };
}
