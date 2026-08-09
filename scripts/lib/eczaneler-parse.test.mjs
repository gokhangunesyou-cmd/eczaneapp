/**
 * Ayrıştırıcı testi — GERÇEK bir kaynak yanıtına karşı (ADR-007).
 *
 * `tests/fixtures/eczaneler-van.html` 8 Ağustos 2026'da kaynaktan olduğu gibi
 * alındı. Van seçildi çünkü tek dosyada üç kenar durumu birden var: koordinatı
 * olan kayıt, koordinatı OLMAYAN kayıt ve tarif notu olmayan kayıt.
 *
 * Testin asıl işi "kaç kayıt çıktı" saymak değil: kaynağın HTML'i değiştiğinde
 * çekimin SESSİZCE boş liste yazmasını engellemek. Bu yüzden son adımda üretilen
 * gövde, Worker'ın gerçekten uyguladığı zod şemasından geçiriliyor.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { importBody } from '../../src/worker/schemas/index.ts';
import { parseCity, parseHeaderDate, normalizePhone, toImportItems } from './eczaneler-parse.mjs';

const FIXTURE = readFileSync(
  path.join(import.meta.dirname, '../../tests/fixtures/eczaneler-van.html'),
  'utf8',
);

const VAN = { code: 65, name: 'Van', slug: 'van' };
/** Örneğin alındığı an — başlıktaki "8 Ağustos"un yılı buradan çözülüyor. */
const NOW = new Date('2026-08-08T17:50:00Z');

describe('parseHeaderDate', () => {
  it('kaynağın yılsız başlığını bugüne göre çözer', () => {
    expect(parseHeaderDate(FIXTURE, NOW)).toBe('2026-08-08');
  });

  it('yıl sonunda en yakın yılı seçer', () => {
    // 1 Ocak listesine 31 Aralık gecesi bakılırsa yıl BİR SONRAKİ olmalı.
    const html = "class='py-2'>1 Ocak Perşembe";
    expect(parseHeaderDate(html, new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01');
  });

  it('okunamayan başlıkta null döner — uydurmaz', () => {
    expect(parseHeaderDate('<table><tbody></tbody></table>', NOW)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('kaynağın biçimini E.164 yapar', () => {
    expect(normalizePhone('0 (432) 651-21-38')).toBe('+904326512138');
  });

  it('telefon yoksa null döner', () => {
    expect(normalizePhone('')).toBeNull();
  });
});

describe('parseCity', () => {
  const rows = parseCity(FIXTURE, VAN.name);

  it('her eczane bloğunu bulur', () => {
    expect(rows).toHaveLength(16);
  });

  it('koordinatı listenin içinden okur — ayrı istek yok', () => {
    const baskale = rows.find((r) => r.name === 'Başkale Eczanesi');
    expect(baskale).toMatchObject({ lat: 38.045303, lng: 44.014583, districtName: 'Başkale' });
  });

  it('koordinatsız kayıt DÜŞMEZ, koordinatsız kalır', () => {
    // Kaynak bu ikisine harita bağlantısı koymamış. Eczane listede görünmeli,
    // yalnızca haritada görünmemeli (ADR-005'teki kural).
    const arjin = rows.find((r) => r.name === 'Arjin Eczanesi');
    expect(arjin).toMatchObject({ lat: null, lng: null });
    expect(rows.filter((r) => r.lat === null)).toHaveLength(2);
  });

  it('adresin sonundaki "İlçe / İl" kuyruğunu atar', () => {
    const arjin = rows.find((r) => r.name === 'Arjin Eczanesi');
    expect(arjin.address).toBe('Beyazıt Mahallesi, Zeylan Caddesi No:1');
    expect(arjin.hint).toBe('(Okyanus Giyim yanı)');
  });

  it('tarif notu olmayan kaydı da doğru okur', () => {
    const ferhat = rows.find((r) => r.name === 'Ferhat Eczanesi');
    expect(ferhat.address).toBe('Urartu Sokak, Eski İstanbul Hastanesi karşısı No:4/C');
    expect(ferhat.hint).toBe('');
  });

  it('yapı değişirse boş döner — çağıran bunu hata sayar', () => {
    expect(parseCity('<table><tbody></tbody></table>', VAN.name)).toHaveLength(0);
  });
});

describe('toImportItems', () => {
  const rows = parseCity(FIXTURE, VAN.name);
  const { items, skipped } = toImportItems(rows, VAN, '2026-08-08');

  it('her kaydı içe aktarılabilir biçime çevirir', () => {
    expect(items).toHaveLength(16);
    expect(skipped).toHaveLength(0);
  });

  it('slug il/ilçe/eczane üçlüsünden türer, "Eczanesi" eki anahtara girmez', () => {
    expect(items.map((i) => i.slug)).toContain('van/baskale/baskale');
  });

  it('tarif notunu adrese ekler', () => {
    const arjin = items.find((i) => i.slug === 'van/ercis/arjin');
    expect(arjin.address).toBe('Beyazıt Mahallesi, Zeylan Caddesi No:1 (Okyanus Giyim yanı)');
  });

  it('nöbet saatlerini projenin rotasyon modelinden türetir', () => {
    // Kaynak saat vermiyor; 08:00 TRT = 05:00Z, ertesi güne kadar.
    expect(items[0].dutyStart).toBe('2026-08-08T05:00:00Z');
    expect(items[0].dutyEnd).toBe('2026-08-09T05:00:00Z');
  });

  it('üretilen gövde Worker şemasından geçer', () => {
    // Asıl güvence bu: uzunluk sınırları, koordinat aralığı, yarım koordinat
    // yasağı ve dutyEnd > dutyStart kuralı burada gerçekten uygulanıyor.
    const parsed = importBody.safeParse({
      cityCode: VAN.code,
      dutyDate: '2026-08-08',
      source: 'edevlet',
      items,
    });
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });
});
