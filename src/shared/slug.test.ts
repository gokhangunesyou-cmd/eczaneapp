import { describe, it, expect } from 'vitest';
import { slugify, pharmacySlug } from './slug';

// Slug doğal anahtardır (ADR-005). Bu testler kuralların kazara değişmesini
// engeller — değişirse mükerrer eczane kaydı ve koordinat kaybı olur.
describe('slugify', () => {
  it('Türkçe harfleri doğru çevirir', () => {
    expect(slugify('Muratpaşa')).toBe('muratpasa');
    expect(slugify('Döşemealtı')).toBe('dosemealti');
    expect(slugify('Gündoğmuş')).toBe('gundogmus');
    expect(slugify('İbradı')).toBe('ibradi');
    expect(slugify('Kaş')).toBe('kas');
    expect(slugify('Çankırı')).toBe('cankiri');
  });

  it('büyük I harfini Türkçe kuralına göre çevirir', () => {
    // JS `'I'.toLowerCase()` → 'i' verir; biz eşlemeyi küçültmeden ÖNCE yapıyoruz.
    expect(slugify('ISPARTA')).toBe('isparta');
    expect(slugify('IĞDIR')).toBe('igdir');
  });

  it('kaynaktan gelen büyük harfli eczane adlarını çevirir', () => {
    expect(slugify('MURTİÇİ')).toBe('murtici');
    expect(slugify('HACI İLYAS')).toBe('haci-ilyas');
  });

  it('noktalama ve fazla boşlukları temizler', () => {
    expect(slugify('  Deniz   Eczanesi  ')).toBe('deniz-eczanesi');
    expect(slugify('Şifa (Yeni) Eczanesi')).toBe('sifa-yeni-eczanesi');
    expect(slugify('A.B.C. Eczanesi')).toBe('a-b-c-eczanesi');
    expect(slugify('---test---')).toBe('test');
  });

  it('sayıları korur', () => {
    expect(slugify('75. Yıl Eczanesi')).toBe('75-yil-eczanesi');
  });
});

describe('pharmacySlug', () => {
  it('il/ilçe/eczane üçlüsünü birleştirir', () => {
    expect(pharmacySlug('antalya', 'akseki', 'MURTİÇİ')).toBe('antalya/akseki/murtici');
  });

  it('aynı ad farklı ilçede farklı slug üretir', () => {
    expect(pharmacySlug('antalya', 'kepez', 'Merkez')).not.toBe(
      pharmacySlug('antalya', 'serik', 'Merkez'),
    );
  });

  // Anahtar KAYNAKTAN BAĞIMSIZ olmalı: e-Devlet "DİNÇERLER" yazıyor,
  // eczaneler.gen.tr "Dinçerler Eczanesi". İkisi aynı eczane, aynı slug.
  it('iki kaynağın yazımını aynı anahtara indirger', () => {
    expect(pharmacySlug('antalya', 'muratpasa', 'DİNÇERLER')).toBe(
      pharmacySlug('antalya', 'muratpasa', 'Dinçerler Eczanesi'),
    );
    expect(pharmacySlug('antalya', 'muratpasa', 'Deniz Eczanesi')).toBe('antalya/muratpasa/deniz');
    expect(pharmacySlug('antalya', 'muratpasa', 'AHMET DOĞAN ECZANESİ')).toBe(
      'antalya/muratpasa/ahmet-dogan',
    );
  });

  it('baştaki "Eczane" korunur — son ek değil', () => {
    // Gerçek ad: kaynakta "Eczane Nish" diye geçiyor.
    expect(pharmacySlug('istanbul', 'sisli', 'Eczane Nish')).toBe('istanbul/sisli/eczane-nish');
  });

  it('adın tamamı son ekten ibaretse ham hâli kullanılır', () => {
    expect(pharmacySlug('antalya', 'kepez', 'Eczane')).toBe('antalya/kepez/eczane');
  });
});
