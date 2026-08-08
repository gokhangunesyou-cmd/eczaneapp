-- seed/dummy-data.sql — GELİŞTİRME İÇİN SAHTE VERİ
--
-- Bu dosya gerçek nöbet verisi DEĞİLDİR. Adresler ve koordinatlar Antalya
-- içinde makul noktalara denk gelir ama uydurmadır. Production'a yüklenmez.
--
--   npm run db:seed     yerel D1'e yükler
--   npm run db:reset    D1'i sıfırlar, migration + seed uygular
--
-- Nöbet tarihleri ÇALIŞMA ANINDA hesaplanır: seed ne zaman koşarsa "bugünün"
-- nöbetini üretir. Nöbet günü 08:00 TRT'de döner; 08:00'den önce koşarsa
-- dünün nöbeti hâlâ geçerlidir ve seed onu üretir.

-- Idempotent: tekrar tekrar koşabilmek için önce temizle.
DELETE FROM duty_shift;
DELETE FROM audit_log;
DELETE FROM pharmacy;

-- ─── Eczaneler ─────────────────────────────────────────────────────────────
INSERT INTO pharmacy (name, phone, address, district_code, lat, lng, notes) VALUES
  ('Deniz Eczanesi',          '+902422371414', 'Tahılpazarı Mah. Ali Çetinkaya Cad. No:41/A', '0715', 36.88620, 30.70560, 'SAHTE VERİ'),
  ('Lara Şifa Eczanesi',      '+902423241188', 'Fener Mah. Tekelioğlu Cad. No:112/B',        '0715', 36.85600, 30.79000, 'SAHTE VERİ'),
  ('Meydan Eczanesi',         '+902422432090', 'Meltem Mah. Dumlupınar Bulvarı No:7',         '0715', 36.87950, 30.68200, 'SAHTE VERİ'),
  ('Işıklar Eczanesi',        '+902422410077', 'Muratpaşa Mah. Işıklar Cad. No:64',           '0715', 36.89100, 30.70900, 'SAHTE VERİ'),

  ('Kepez Sağlık Eczanesi',   '+902423440505', 'Yeşilırmak Mah. Yeşilırmak Cad. No:8',        '0711', 36.93300, 30.68000, 'SAHTE VERİ'),
  ('Varsak Meydan Eczanesi',  '+902423512244', 'Varsak Mah. Cumhuriyet Cad. No:23',           '0711', 36.97000, 30.69000, 'SAHTE VERİ'),
  ('Barınaklar Eczanesi',     '+902423288910', 'Barınaklar Mah. 1234 Sok. No:5',              '0711', 36.94500, 30.71500, 'SAHTE VERİ'),

  ('Konyaaltı Eczanesi',      '+902422591616', 'Liman Mah. Atatürk Bulvarı No:57',            '0709', 36.86200, 30.62800, 'SAHTE VERİ'),
  ('Sahil Eczanesi',          '+902422294433', 'Arapsuyu Mah. Gazi Mustafa Kemal Bulvarı No:19', '0709', 36.87400, 30.65400, 'SAHTE VERİ'),

  ('Aksu Yeni Eczane',        '+902424261050', 'Fatih Mah. Antalya Cad. No:3',                '0702', 36.94500, 30.84000, 'SAHTE VERİ'),
  ('Döşemealtı Eczanesi',     '+902424431177', 'Yeniköy Mah. Ahmet Aslan Cad. No:12',         '0708', 37.01500, 30.60500, 'SAHTE VERİ'),
  ('Serik Merkez Eczanesi',   '+902427223388', 'Merkez Mah. Atatürk Cad. No:88',              '0716', 36.91800, 31.10200, 'SAHTE VERİ'),
  ('Manavgat Irmak Eczanesi', '+902427465522', 'Aşağı Pazarcı Mah. Demokrasi Bulvarı No:41',  '0713', 36.78600, 31.44300, 'SAHTE VERİ'),
  ('Alanya Şifa Eczanesi',    '+902425139966', 'Saray Mah. Atatürk Cad. No:150',              '0701', 36.54400, 32.00000, 'SAHTE VERİ');

-- ─── Bugünün nöbeti ────────────────────────────────────────────────────────
-- duty_date: şu anı TRT'ye çevir (+3s), 8 saat geri al ki 08:00 öncesi bir
-- önceki güne düşsün, tarihini al.  Pencere: o gün 05:00Z → ertesi gün 05:00Z
-- (= 08:00 TRT → 08:00 TRT).
INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, created_by)
SELECT
  p.id,
  date(datetime('now', '+3 hours', '-8 hours')),
  date(datetime('now', '+3 hours', '-8 hours')) || 'T05:00:00Z',
  date(datetime('now', '+3 hours', '-8 hours'), '+1 day') || 'T05:00:00Z',
  'seed'
FROM pharmacy p
WHERE p.name IN (
  'Deniz Eczanesi',
  'Lara Şifa Eczanesi',
  'Kepez Sağlık Eczanesi',
  'Varsak Meydan Eczanesi',
  'Konyaaltı Eczanesi',
  'Aksu Yeni Eczane',
  'Döşemealtı Eczanesi',
  'Manavgat Irmak Eczanesi'
);

-- ─── Yarının nöbeti ────────────────────────────────────────────────────────
-- Panelde "yarın" sekmesinin dolu görünmesi ve gece yarısı testleri için.
INSERT INTO duty_shift (pharmacy_id, duty_date, duty_start, duty_end, created_by)
SELECT
  p.id,
  date(datetime('now', '+3 hours', '-8 hours'), '+1 day'),
  date(datetime('now', '+3 hours', '-8 hours'), '+1 day') || 'T05:00:00Z',
  date(datetime('now', '+3 hours', '-8 hours'), '+2 days') || 'T05:00:00Z',
  'seed'
FROM pharmacy p
WHERE p.name IN (
  'Meydan Eczanesi',
  'Işıklar Eczanesi',
  'Barınaklar Eczanesi',
  'Sahil Eczanesi',
  'Serik Merkez Eczanesi',
  'Alanya Şifa Eczanesi'
);
