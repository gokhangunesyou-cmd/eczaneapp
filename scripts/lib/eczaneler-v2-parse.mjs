/**
 * eczaneler.gen.tr v2 HTML ayrıştırıcısı (Bugün + Yarın + Harita Koordinatları).
 *
 * Saf fonksiyonlar: DOM'a veya ağa doğrudan bağımlı değildir, bu yüzden
 * birim testlerle doğrulanabilir.
 */

import { slugify, pharmacySlug } from '../../src/shared/slug.ts';
import { dutyStartOf, dutyEndOf } from '../../src/shared/duty.ts';

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };

const decode = (s) =>
  s
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

export const stripTags = (s) =>
  decode((s || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const TR_MONTHS = [
  'ocak',
  'şubat',
  'mart',
  'nisan',
  'mayıs',
  'haziran',
  'temmuz',
  'ağustos',
  'eylül',
  'ekim',
  'kasım',
  'aralık',
];

/** `0 (505) 596-37-01` → `+905055963701`. Rakam yoksa `null`. */
export function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.replace(/^0+/, '');
  return local.length === 10 ? `+90${local}` : `+${digits}`;
}

/** Türkiye koordinat kutusu — şemadaki CHECK ile aynı sınırlar. */
export function inTurkey(lat, lng) {
  return lat >= 35.8 && lat <= 42.2 && lng >= 25.6 && lng <= 44.9;
}

/**
 * Sayfadaki belirli bir tab panelinden (nav-bugun veya nav-yarin) eczane satırlarını çıkarır.
 */
export function extractRowsFromPane(html, paneId) {
  const paneRe = new RegExp(`id=[\"']${paneId}[\"'][\\s\\S]*?(?=id=[\"']nav-|<footer|<\\/main>|<\\/body>|$)`, 'i');
  const paneMatch = html.match(paneRe);
  if (!paneMatch) return [];

  const paneHtml = paneMatch[0];
  const rows = [...paneHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const results = [];

  for (let index = 0; index < rows.length; index++) {
    const r = rows[index];
    if (r.includes('Eczane adı') || !r.includes('class="isim"')) continue;

    const name = stripTags(r.match(/class=[\"']isim[\"']>([\s\S]*?)<\/span>/i)?.[1] ?? '');
    if (!name) continue;

    const link = r.match(/<a[^>]+href=[\"'](\/eczane\/[^\"']+)[\"']/i)?.[1] || '';
    const districtName = stripTags(
      r.match(/class=[\"'][^\"']*bg-info[^\"']*[\"']>([\s\S]*?)<\/span>/i)?.[1] ?? '',
    );
    const neighborhood = stripTags(
      r.match(/class=[\"'][^\"']*bg-secondary[^\"']*[\"']>([\s\S]*?)<\/span>/i)?.[1] ?? '',
    );

    const phoneRaw = r.match(/(\d\s*\(\d{3}\)\s*\d{3}[\s-]*\d{2}[\s-]*\d{2}|\b0\d{10}\b)/)?.[0]?.trim() || '';

    // Tarif notu (→ ...)
    const hint = stripTags(r.match(/font-italic[\"']>([\s\S]*?)<\/span>/i)?.[1] ?? '');

    // Gece kısıt notu (» Gece 23:59'a kadar ...)
    const timeLimitMatch = r.match(/»\s*Gece\s*(\d{1,2}:\d{2})/i);
    const customCloseTime = timeLimitMatch ? timeLimitMatch[1] : null;

    results.push({
      index,
      name,
      link,
      districtName,
      neighborhood,
      phoneRaw,
      hint,
      customCloseTime,
    });
  }

  return results;
}

/**
 * `?harita=1` sayfasındaki Yandex Placemark scriptinden tüm koordinatları ayıklar.
 * Döner: Map<string, { lat: number, lng: number }> (anahtar: küçük harfli normalize edilmiş ad)
 */
export function extractCoordsFromMap(mapHtml) {
  const coordsMap = new Map();
  if (!mapHtml) return coordsMap;

  // 1. ymaps.Placemark([lat, lng], {hintContent: 'Ad'...
  const ymRe = /new\s+ymaps\.Placemark\(\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]\s*,\s*\{\s*hintContent:\s*['\"]([^'\"]+)['\"]/gi;
  let m;
  while ((m = ymRe.exec(mapHtml)) !== null) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    const name = stripTags(m[3]).toLocaleLowerCase('tr').replace(/\s*eczanesi\s*$/i, '').trim();
    if (inTurkey(lat, lng)) {
      coordsMap.set(name, { lat, lng });
    }
  }

  // 2. Google Maps daddr linkleri (yedek)
  const gRe = /maps\?daddr=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = gRe.exec(mapHtml)) !== null) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    const name = stripTags(m[3]).toLocaleLowerCase('tr').replace(/\s*eczanesi\s*$/i, '').trim();
    if (name && inTurkey(lat, lng) && !coordsMap.has(name)) {
      coordsMap.set(name, { lat, lng });
    }
  }

  return coordsMap;
}

/**
 * Ayrıştırılmış satırları `/api/admin/import` gövdesindeki `items` formatına dönüştürür.
 *
 * @param {Array} rows extractRowsFromPane çıktısı
 * @param {Map} coordsMap extractCoordsFromMap çıktısı
 * @param {object} city { code: 7, slug: 'antalya', name: 'Antalya' }
 * @param {string} dutyDate 'YYYY-MM-DD'
 */
export function toImportItems(rows, coordsMap, city, dutyDate) {
  const defaultDutyStart = dutyStartOf(dutyDate);
  const defaultDutyEnd = dutyEndOf(dutyDate);

  const items = [];
  const skipped = [];
  const bySlug = new Map();
  let duplicates = 0;

  for (const r of rows) {
    if (!r.name || !r.districtName) {
      skipped.push({
        index: r.index,
        name: r.name || '(adsız)',
        reason: !r.name ? 'ad yok' : 'ilçe yok',
      });
      continue;
    }

    const slug = pharmacySlug(city.slug, slugify(r.districtName), r.name);
    if (bySlug.has(slug)) {
      duplicates++;
      continue;
    }

    // Koordinat bulma: adı normalize edip coordsMap'ten ara
    const normName = r.name.toLocaleLowerCase('tr').replace(/\s*eczanesi\s*$/i, '').trim();
    const coord = coordsMap.get(normName) || coordsMap.get(r.name.toLocaleLowerCase('tr')) || null;

    // Kapanış saati istisnası (Örn: Gece 23:59 veya Gece 02:00)
    let dutyEnd = defaultDutyEnd;
    if (r.customCloseTime) {
      const [hh, mm] = r.customCloseTime.split(':').map(Number);
      // TRT saati UTC'ye çevrilir (UTC = TRT - 3 saat)
      // Gece 23:59 TRT -> 20:59 UTC (aynı gün)
      // Gece 02:00 TRT -> 23:00 UTC (önceki gün UTC)
      const trtDate = new Date(`${dutyDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`);
      dutyEnd = trtDate.toISOString().slice(0, 19) + 'Z';
    }

    // Adres oluşturma:
    // Eğer ilçe/semt/tarif varsa zengin adres oluştur
    const addrParts = [];
    if (r.neighborhood) addrParts.push(`${r.neighborhood} Mah.`);
    if (r.hint) addrParts.push(`(${r.hint})`);
    addrParts.push(`${r.districtName} / ${city.name}`);
    const address = addrParts.join(' ');

    const item = {
      slug,
      name: r.name.slice(0, 120),
      districtName: r.districtName.slice(0, 80),
      districtSlug: slugify(r.districtName),
      address: address.slice(0, 300),
      phone: normalizePhone(r.phoneRaw),
      dutyStart: defaultDutyStart,
      dutyEnd,
      sourceStatus: r.customCloseTime ? `Gece ${r.customCloseTime}'a kadar` : null,
      lat: coord ? coord.lat : null,
      lng: coord ? coord.lng : null,
    };

    bySlug.set(slug, item);
    items.push(item);
  }

  return { items, skipped, duplicates };
}
