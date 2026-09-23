import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCityCode, createDirections, fetchDutyPharmacies } from './pharmacy-service';

describe('pharmacy-service', () => {
  describe('resolveCityCode', () => {
    it('resolves numeric city codes', () => {
      expect(resolveCityCode(7)).toBe(7);
      expect(resolveCityCode('34')).toBe(34);
      expect(resolveCityCode('06')).toBe(6);
    });

    it('resolves city names and Turkish slug variations', () => {
      expect(resolveCityCode('İstanbul')).toBe(34);
      expect(resolveCityCode('istanbul')).toBe(34);
      expect(resolveCityCode('Ankara')).toBe(6);
      expect(resolveCityCode('Antalya')).toBe(7);
      expect(resolveCityCode('İzmir')).toBe(35);
      expect(resolveCityCode('Diyarbakır')).toBe(21);
      expect(resolveCityCode('Şanlıurfa')).toBe(63);
    });

    it('defaults to 7 (Antalya) for invalid or empty inputs', () => {
      expect(resolveCityCode(null)).toBe(7);
      expect(resolveCityCode('')).toBe(7);
      expect(resolveCityCode('BilinmeyenYer')).toBe(7);
    });
  });

  describe('createDirections', () => {
    it('generates valid direction links for latitude and longitude', () => {
      const links = createDirections(36.8862, 30.7056);
      expect(links.googleMaps).toContain(
        'https://www.google.com/maps/dir/?api=1&destination=36.8862,30.7056',
      );
      expect(links.appleMaps).toContain('https://maps.apple.com/?daddr=36.8862,30.7056');
      expect(links.yandexMaps).toContain('https://yandex.com/maps/?rtext=~36.8862,30.7056');
      expect(links.waze).toContain('https://waze.com/ul?ll=36.8862,30.7056');
    });
  });

  describe('fetchDutyPharmacies with mock fetch', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches duty pharmacies and attaches directions links', async () => {
      const mockResponse = {
        stale: false,
        dataAsOf: '2026-08-09T08:00:00Z',
        nextRotationAt: '2026-08-10T05:00:00Z',
        cityCode: 7,
        items: [
          {
            id: 'antalya-eo:123',
            name: 'Muratpaşa Eczanesi',
            phone: '+90 242 123 45 67',
            address: 'Atatürk Cad. No:10',
            districtCode: '0715',
            districtName: 'Muratpaşa',
            lat: 36.8862,
            lng: 30.7056,
            dutyStart: '2026-08-09T05:00:00Z',
            dutyEnd: '2026-08-10T05:00:00Z',
            status: 'open',
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await fetchDutyPharmacies({ city: 'Antalya', district: '0715' });

      expect(result.cityCode).toBe(7);
      expect(result.cityName).toBe('Antalya');
      expect(result.count).toBe(1);
      expect(result.items[0].name).toBe('Muratpaşa Eczanesi');
      expect(result.items[0].callUrl).toBe('tel:+902421234567');
      expect(result.items[0].directions.googleMaps).toContain('36.8862,30.7056');
    });
  });
});
