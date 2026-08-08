/**
 * eczaneler.gen.tr HTML ayrıştırması (ADR-007).
 *
 * Çekim komutundan AYRI dosyada: burası ağa çıkmayan, yan etkisiz saf
 * fonksiyonlardan ibaret, bu yüzden gerçek bir HTML örneğine karşı test
 * edilebiliyor (`eczaneler-parse.test.mjs`). Kaynağın yapısı değişirse testi
 * kırar — sessizce boş liste yazıp "81 il tamam" demez.
 *
 * Bağımlılık eklememek için regex kullanılır. Kaynak HTML'i sunucuda üretiliyor
 * ve düzenli; yine de hizalamaya değil, İÇERİK İŞARETLERİNE bakılır.
 */

import { slugify, pharmacySlug } from '../../src/shared/slug.ts';
import { dutyStartOf, dutyEndOf } from '../../src/shared/duty.ts';

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };

const decode = (s) =>
  s
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

export const stripTags = (s) =>
  decode(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/**
 * Başlıktaki `8 Ağustos Cumartesi` → `2026-08-08`.
 *
 * Kaynak YIL YAZMIYOR. Yıl bugünden çıkarılır; 31 Aralık ↔ 1 Ocak geçişinde
 * yanlış yıla düşmemek için aday yıllar denenip bugüne EN YAKIN olan seçilir.
 * Okunamazsa `null` döner — çağıran kendi hesabına düşer.
 */
export function parseHeaderDate(html, now) {
  const m = html.match(/class='py-2'>\s*(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = TR_MONTHS.indexOf(m[2].toLocaleLowerCase('tr'));
  if (month < 0) return null;

  const thisYear = new Date(now.getTime() + 3 * 3_600_000).getUTCFullYear();
  let best = null;
  for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
    const t = Date.UTC(year, month, day);
    const gap = Math.abs(t - now.getTime());
    if (best === null || gap < best.gap) {
      best = { gap, iso: new Date(t).toISOString().slice(0, 10) };
    }
  }
  return best?.iso ?? null;
}

/** `0 (505) 596-37-01` → `+905055963701`. Rakam yoksa `null`. */
export function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.replace(/^0+/, '');
  return local.length === 10 ? `+90${local}` : `+${digits}`;
}

/**
 * Adresin sonundaki `... Ceyhan / Adana` kuyruğunu atar.
 *
 * İlçe ve il zaten ayrı alanlarda taşınıyor. Kuyruk YALNIZCA o kaydın kendi
 * ilçe/il adıyla eşleşiyorsa silinir — körlemesine "son iki kelimeyi at" demek
 * gerçek adres parçalarını yerdi.
 */
export function trimAddressTail(address, districtName, cityName) {
  const tail = new RegExp(
    `[\\s,]*${escapeRe(districtName)}\\s*/\\s*${escapeRe(cityName)}\\s*$`,
    'i',
  );
  return address.replace(tail, '').trim();
}

/** Türkiye kutusu — şemadaki CHECK ile aynı sınırlar. */
function inTurkey(lat, lng) {
  return lat >= 35.8 && lat <= 42.2 && lng >= 25.6 && lng <= 44.9;
}

/**
 * Bir ilin HTML'inden ham kayıtlar.
 *
 * Kaynak her eczaneyi ÜÇ `<tr>` ile yazıyor (ad+konum, telefon, adres) ve
 * aralarındaki kapanış etiketleri tutarsız. Bu yüzden satır sayarak değil,
 * "eczane" ikonundan İTİBAREN bloklara bölünür: telefon, koordinat ya da tarif
 * notu eksik olduğunda hizalama kaymaz.
 */
export function parseCity(html, cityName) {
  const blocks = html
    .split(/(?=<tr><td><img[^>]*alt='eczane')/i)
    .filter((b) => /alt='eczane'/i.test(b));

  return blocks.map((b, index) => {
    const name = stripTags(
      b.match(/<span class='text-dark'><b>([\s\S]*?)<\/b><\/span>/i)?.[1] ?? '',
    );
    const districtName = stripTags(
      b.match(/<span class='text-secondary'>\(([\s\S]*?)\)<\/span>/i)?.[1] ?? '',
    );

    // Koordinat "yol tarifi" bağlantısının içinde geliyor — AYRI İSTEK YOK.
    // e-Devlet'te eczane başına bir istek gerekiyordu (ADR-005), bu kaynağı
    // seçmemizin asıl sebebi bu.
    const c = b.match(/maps\?daddr=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
    const lat = c ? Number(c[1]) : null;
    const lng = c ? Number(c[2]) : null;
    const hasCoords = lat !== null && lng !== null && inTurkey(lat, lng);

    const phoneRaw = stripTags(b.match(/alt='telefon'><\/td><td>([\s\S]*?)<\/td>/i)?.[1] ?? '');

    const addrCell = b.match(/alt='adres'><\/td><td>([\s\S]*?)<\/td>/i)?.[1] ?? '';
    const [addrMain, ...addrRest] = addrCell.split(/<br\s*\/?>/i);

    return {
      index,
      name,
      districtName,
      address: trimAddressTail(stripTags(addrMain), districtName, cityName),
      // `(BİM Market yanı, Doğa Koleji civarı)` — kaynağın tarif notu.
      // Adresin kendisi kadar işe yarıyor, adrese eklenir.
      hint: stripTags(addrRest.join(' ')),
      phoneRaw,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
    };
  });
}

/**
 * Ham kayıtları `/api/admin/import` gövdesindeki `items` biçimine çevirir.
 *
 * Nöbet saatleri KAYNAKTA YOK. Uydurulmuyor: projenin kendi rotasyon modelinden
 * (`src/shared/duty.ts`, her gün 08:00 TRT) türetiliyor — okuma yolundaki
 * `nextRotationAt`, `minutesUntilClose` ve cache TTL'i zaten aynı modeli
 * kullandığı için tutarlı.
 *
 * `{ items, skipped }` döner; zorunlu alanı eksik olan kayıt SESSİZCE düşmez,
 * `skipped` içinde nedeniyle birlikte raporlanır.
 */
export function toImportItems(rows, city, dutyDate) {
  const dutyStart = dutyStartOf(dutyDate);
  const dutyEnd = dutyEndOf(dutyDate);

  const items = [];
  const skipped = [];
  // Kaynak aynı eczaneyi birden çok satırda listeleyebiliyor. Slug doğal anahtar
  // olduğu için mükerrerler burada birleşir; ilk kayıt tutulur.
  const bySlug = new Map();
  let duplicates = 0;

  for (const r of rows) {
    if (!r.name || !r.districtName || !r.address) {
      skipped.push({
        index: r.index,
        name: r.name || '(adsız)',
        reason: !r.name ? 'ad yok' : !r.districtName ? 'ilçe yok' : 'adres yok',
      });
      continue;
    }

    const slug = pharmacySlug(city.slug, slugify(r.districtName), r.name);
    if (bySlug.has(slug)) {
      duplicates++;
      continue;
    }

    const address = r.hint ? `${r.address} ${r.hint}` : r.address;

    const item = {
      slug,
      name: r.name.slice(0, 120),
      districtName: r.districtName.slice(0, 80),
      districtSlug: slugify(r.districtName),
      // Şema 300 karakterle sınırlı; tarif notu uzun olabiliyor.
      address: address.slice(0, 300),
      phone: normalizePhone(r.phoneRaw),
      dutyStart,
      dutyEnd,
      sourceStatus: null,
      lat: r.lat,
      lng: r.lng,
    };

    bySlug.set(slug, item);
    items.push(item);
  }

  return { items, skipped, duplicates };
}
