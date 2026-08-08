-- 0002 — Antalya ilçeleri (plaka 7)
--
-- Sabit referans veri; panelden düzenlenmez. TÜİK ilçe kodları.
-- sort_order nüfus büyüklüğüne göre: panelin ilçe listesinde en olası
-- seçimler üstte çıksın (tasarım ekranı 06).

INSERT INTO district (code, city_code, name, sort_order) VALUES
  ('0715', 7, 'Muratpaşa',   1),
  ('0711', 7, 'Kepez',       2),
  ('0709', 7, 'Konyaaltı',   3),
  ('0713', 7, 'Manavgat',    4),
  ('0701', 7, 'Alanya',      5),
  ('0716', 7, 'Serik',       6),
  ('0702', 7, 'Aksu',        7),
  ('0708', 7, 'Döşemealtı',  8),
  ('0714', 7, 'Kumluca',     9),
  ('0703', 7, 'Finike',     10),
  ('0704', 7, 'Gazipaşa',   11),
  ('0705', 7, 'Gündoğmuş',  12),
  ('0706', 7, 'İbradı',     13),
  ('0707', 7, 'Kaş',        14),
  ('0710', 7, 'Korkuteli',  15),
  ('0712', 7, 'Elmalı',     16),
  ('0717', 7, 'Akseki',     17),
  ('0718', 7, 'Demre',      18),
  ('0719', 7, 'Kemer',      19);
