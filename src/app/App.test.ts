import { describe, it, expect } from 'vitest';
import { parseRouteSlugs } from './lib/routes';
import type { City } from './lib/api';

const mockCities: City[] = [
  { code: 7, name: 'Antalya', slug: 'antalya', districtCount: 19 },
  { code: 34, name: 'İstanbul', slug: 'istanbul', districtCount: 39 },
  { code: 3, name: 'Afyonkarahisar', slug: 'afyonkarahisar', districtCount: 18 },
];

describe('parseRouteSlugs', () => {
  it('boş rota veya kök dizinde null döner', () => {
    expect(parseRouteSlugs('/', mockCities)).toEqual({
      citySlug: null,
      districtSlug: null,
      pharmacyKey: null,
    });
  });

  it('/antalya-nobetci-eczane il rotasını çözer', () => {
    expect(parseRouteSlugs('/antalya-nobetci-eczane', mockCities)).toEqual({
      citySlug: 'antalya',
      districtSlug: null,
      pharmacyKey: null,
    });
  });

  it('/antalya-kemer-nobetci-eczane ilçe rotasını çözer', () => {
    expect(parseRouteSlugs('/antalya-kemer-nobetci-eczane', mockCities)).toEqual({
      citySlug: 'antalya',
      districtSlug: 'kemer',
      pharmacyKey: null,
    });
  });

  it('/afyonkarahisar-dinar-nobetci-eczane uzun il adını çözer', () => {
    expect(parseRouteSlugs('/afyonkarahisar-dinar-nobetci-eczane', mockCities)).toEqual({
      citySlug: 'afyonkarahisar',
      districtSlug: 'dinar',
      pharmacyKey: null,
    });
  });

  it('/antalya-muratpasa-deniz-eczanesi eczane profil rotasını çözer', () => {
    expect(parseRouteSlugs('/antalya-muratpasa-deniz-eczanesi', mockCities)).toEqual({
      citySlug: 'antalya',
      districtSlug: 'muratpasa',
      pharmacyKey: 'deniz',
    });
  });

  it('kısa yedek yolları da (/antalya, /antalya/kemer) destekler', () => {
    expect(parseRouteSlugs('/antalya', mockCities)).toEqual({
      citySlug: 'antalya',
      districtSlug: null,
      pharmacyKey: null,
    });
    expect(parseRouteSlugs('/antalya/kemer', mockCities)).toEqual({
      citySlug: 'antalya',
      districtSlug: 'kemer',
      pharmacyKey: null,
    });
  });

  it('/iller ve /tum-iller rotasını çözer', () => {
    expect(parseRouteSlugs('/iller', mockCities)).toEqual({
      view: 'all-cities',
      citySlug: null,
      districtSlug: null,
      pharmacyKey: null,
    });
  });
});
