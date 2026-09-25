import { describe, it, expect } from 'vitest';
import { extractRowsFromPane, extractCoordsFromMap, toImportItems, normalizePhone } from './eczaneler-v2-parse.mjs';

describe('eczaneler-v2-parse', () => {
  it('telefon numarasını doğru normalize eder', () => {
    expect(normalizePhone('0 (242) 678-13-00')).toBe('+902426781300');
    expect(normalizePhone('02163812112')).toBe('+902163812112');
    expect(normalizePhone('')).toBeNull();
  });

  it('HTML tab panelinden eczane satırlarını ayıklar', () => {
    const sampleHtml = `
      <div id="nav-bugun">
        <table>
          <tr><td>Eczane adı</td></tr>
          <tr>
            <td>
              <a href="/eczane/antalya-akseki-murtici-eczanesi"><span class="isim">Murtiçi Eczanesi</span></a>
              <span class="bg-info">Akseki</span>
              <span class="font-italic">Büyük Otel karşısı</span>
              0 (242) 678-13-00
            </td>
          </tr>
          <tr>
            <td>
              <span class="isim">Gece Eczanesi</span>
              <span class="bg-info">Muratpaşa</span>
              » Gece 23:59'a kadar nöbetçidir
              0 (242) 316-15-22
            </td>
          </tr>
        </table>
      </div>
    `;

    const rows = extractRowsFromPane(sampleHtml, 'nav-bugun');
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('Murtiçi Eczanesi');
    expect(rows[0].districtName).toBe('Akseki');
    expect(rows[0].hint).toBe('Büyük Otel karşısı');
    expect(rows[0].phoneRaw).toBe('0 (242) 678-13-00');

    expect(rows[1].name).toBe('Gece Eczanesi');
    expect(rows[1].customCloseTime).toBe('23:59');
  });

  it('harita sayfasından koordinatları ayıklar', () => {
    const sampleMapHtml = `
      <script>
        myPlacemark1 = new ymaps.Placemark([36.896586,30.677427], {hintContent: 'Aile Eczanesi'});
        myPlacemark2 = new ymaps.Placemark([37.042269,31.786283], {hintContent: 'Murtiçi Eczanesi'});
      </script>
    `;

    const coords = extractCoordsFromMap(sampleMapHtml);
    expect(coords.size).toBe(2);
    expect(coords.get('aile')).toEqual({ lat: 36.896586, lng: 30.677427 });
    expect(coords.get('murtiçi')).toEqual({ lat: 37.042269, lng: 31.786283 });
  });

  it('toImportItems satırları import şemasına dönüştürür ve gece kısıtını uygular', () => {
    const rows = [
      {
        index: 0,
        name: 'Murtiçi Eczanesi',
        districtName: 'Akseki',
        phoneRaw: '0 (242) 678-13-00',
        hint: '',
        customCloseTime: null,
      },
      {
        index: 1,
        name: 'Gece Eczanesi',
        districtName: 'Muratpaşa',
        phoneRaw: '0 (242) 316-15-22',
        hint: '',
        customCloseTime: '23:59',
      },
    ];

    const coords = new Map([['murtiçi', { lat: 37.042, lng: 31.786 }]]);
    const city = { code: 7, slug: 'antalya', name: 'Antalya' };
    const { items, skipped } = toImportItems(rows, coords, city, '2026-09-25');

    expect(skipped.length).toBe(0);
    expect(items.length).toBe(2);

    expect(items[0].slug).toBe('antalya/akseki/murtici');
    expect(items[0].lat).toBe(37.042);
    expect(items[0].dutyEnd).toBe('2026-09-26T05:00:00Z'); // Ertesi gün 08:00 TRT

    expect(items[1].dutyEnd).toContain('2026-09-25T20:59:00'); // 23:59 TRT = 20:59 UTC
    expect(items[1].sourceStatus).toBe("Gece 23:59'a kadar");
  });
});
