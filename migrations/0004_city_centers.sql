-- 0004 — il merkezleri ve koordinat indeksi (ADR-006)
--
-- Genel API artık 81 ili servis ediyor ve kullanıcının ilini KONUMDAN çözüyor.
-- Çözüm iki adımlı:
--   1. Kullanıcının etrafındaki kutuda en yakın eczane → onun ili. (asıl yol)
--   2. Kutuda hiç eczane yoksa → merkezi en yakın il. (yedek yol)
--
-- İkinci adım bu migration'ın sebebi. Reverse geocoding KULLANILMIYOR: MapTiler
-- ücretsiz kotası harita yüklemesi için ayrılmış, il tespitine harcanmaz.
--
-- Koordinatlar il merkezlerinin yaklaşık değerleridir; amaç "hangi il" sorusunu
-- cevaplamak, konum göstermek değil. Metre hassasiyeti aranmaz.

ALTER TABLE city ADD COLUMN lat REAL;
ALTER TABLE city ADD COLUMN lng REAL;

UPDATE city SET lat = 37.00, lng = 35.32 WHERE code = 1;
UPDATE city SET lat = 37.76, lng = 38.28 WHERE code = 2;
UPDATE city SET lat = 38.76, lng = 30.54 WHERE code = 3;
UPDATE city SET lat = 39.72, lng = 43.05 WHERE code = 4;
UPDATE city SET lat = 40.65, lng = 35.83 WHERE code = 5;
UPDATE city SET lat = 39.93, lng = 32.86 WHERE code = 6;
UPDATE city SET lat = 36.89, lng = 30.71 WHERE code = 7;
UPDATE city SET lat = 41.18, lng = 41.82 WHERE code = 8;
UPDATE city SET lat = 37.85, lng = 27.84 WHERE code = 9;
UPDATE city SET lat = 39.65, lng = 27.89 WHERE code = 10;
UPDATE city SET lat = 40.14, lng = 29.98 WHERE code = 11;
UPDATE city SET lat = 38.88, lng = 40.50 WHERE code = 12;
UPDATE city SET lat = 38.40, lng = 42.11 WHERE code = 13;
UPDATE city SET lat = 40.74, lng = 31.61 WHERE code = 14;
UPDATE city SET lat = 37.72, lng = 30.29 WHERE code = 15;
UPDATE city SET lat = 40.19, lng = 29.06 WHERE code = 16;
UPDATE city SET lat = 40.15, lng = 26.41 WHERE code = 17;
UPDATE city SET lat = 40.60, lng = 33.62 WHERE code = 18;
UPDATE city SET lat = 40.55, lng = 34.95 WHERE code = 19;
UPDATE city SET lat = 37.78, lng = 29.09 WHERE code = 20;
UPDATE city SET lat = 37.91, lng = 40.24 WHERE code = 21;
UPDATE city SET lat = 41.68, lng = 26.56 WHERE code = 22;
UPDATE city SET lat = 38.68, lng = 39.22 WHERE code = 23;
UPDATE city SET lat = 39.75, lng = 39.49 WHERE code = 24;
UPDATE city SET lat = 39.90, lng = 41.27 WHERE code = 25;
UPDATE city SET lat = 39.78, lng = 30.52 WHERE code = 26;
UPDATE city SET lat = 37.07, lng = 37.38 WHERE code = 27;
UPDATE city SET lat = 40.91, lng = 38.39 WHERE code = 28;
UPDATE city SET lat = 40.46, lng = 39.48 WHERE code = 29;
UPDATE city SET lat = 37.57, lng = 43.74 WHERE code = 30;
UPDATE city SET lat = 36.20, lng = 36.16 WHERE code = 31;
UPDATE city SET lat = 37.77, lng = 30.55 WHERE code = 32;
UPDATE city SET lat = 36.81, lng = 34.63 WHERE code = 33;
UPDATE city SET lat = 41.01, lng = 28.98 WHERE code = 34;
UPDATE city SET lat = 38.42, lng = 27.14 WHERE code = 35;
UPDATE city SET lat = 40.60, lng = 43.09 WHERE code = 36;
UPDATE city SET lat = 41.39, lng = 33.78 WHERE code = 37;
UPDATE city SET lat = 38.73, lng = 35.49 WHERE code = 38;
UPDATE city SET lat = 41.74, lng = 27.22 WHERE code = 39;
UPDATE city SET lat = 39.15, lng = 34.16 WHERE code = 40;
UPDATE city SET lat = 40.77, lng = 29.92 WHERE code = 41;
UPDATE city SET lat = 37.87, lng = 32.48 WHERE code = 42;
UPDATE city SET lat = 39.42, lng = 29.99 WHERE code = 43;
UPDATE city SET lat = 38.35, lng = 38.31 WHERE code = 44;
UPDATE city SET lat = 38.62, lng = 27.43 WHERE code = 45;
UPDATE city SET lat = 37.58, lng = 36.93 WHERE code = 46;
UPDATE city SET lat = 37.31, lng = 40.74 WHERE code = 47;
UPDATE city SET lat = 37.22, lng = 28.36 WHERE code = 48;
UPDATE city SET lat = 38.73, lng = 41.49 WHERE code = 49;
UPDATE city SET lat = 38.62, lng = 34.71 WHERE code = 50;
UPDATE city SET lat = 37.97, lng = 34.68 WHERE code = 51;
UPDATE city SET lat = 40.98, lng = 37.88 WHERE code = 52;
UPDATE city SET lat = 41.02, lng = 40.52 WHERE code = 53;
UPDATE city SET lat = 40.76, lng = 30.40 WHERE code = 54;
UPDATE city SET lat = 41.29, lng = 36.33 WHERE code = 55;
UPDATE city SET lat = 37.93, lng = 41.94 WHERE code = 56;
UPDATE city SET lat = 42.03, lng = 35.15 WHERE code = 57;
UPDATE city SET lat = 39.75, lng = 37.02 WHERE code = 58;
UPDATE city SET lat = 40.98, lng = 27.51 WHERE code = 59;
UPDATE city SET lat = 40.31, lng = 36.55 WHERE code = 60;
UPDATE city SET lat = 41.00, lng = 39.72 WHERE code = 61;
UPDATE city SET lat = 39.11, lng = 39.55 WHERE code = 62;
UPDATE city SET lat = 37.16, lng = 38.79 WHERE code = 63;
UPDATE city SET lat = 38.68, lng = 29.41 WHERE code = 64;
UPDATE city SET lat = 38.49, lng = 43.38 WHERE code = 65;
UPDATE city SET lat = 39.82, lng = 34.80 WHERE code = 66;
UPDATE city SET lat = 41.45, lng = 31.79 WHERE code = 67;
UPDATE city SET lat = 38.37, lng = 34.03 WHERE code = 68;
UPDATE city SET lat = 40.26, lng = 40.23 WHERE code = 69;
UPDATE city SET lat = 37.18, lng = 33.22 WHERE code = 70;
UPDATE city SET lat = 39.85, lng = 33.52 WHERE code = 71;
UPDATE city SET lat = 37.88, lng = 41.13 WHERE code = 72;
UPDATE city SET lat = 37.52, lng = 42.46 WHERE code = 73;
UPDATE city SET lat = 41.64, lng = 32.34 WHERE code = 74;
UPDATE city SET lat = 41.11, lng = 42.70 WHERE code = 75;
UPDATE city SET lat = 39.92, lng = 44.04 WHERE code = 76;
UPDATE city SET lat = 40.65, lng = 29.27 WHERE code = 77;
UPDATE city SET lat = 41.20, lng = 32.62 WHERE code = 78;
UPDATE city SET lat = 36.72, lng = 37.12 WHERE code = 79;
UPDATE city SET lat = 37.07, lng = 36.25 WHERE code = 80;
UPDATE city SET lat = 40.84, lng = 31.16 WHERE code = 81;

-- Konumdan il çözümü kullanıcının etrafında bir kutu tarıyor. İndeks olmadan
-- bu tarama tüm eczane tablosunu okur — D1 satır okuma kotasının en dar kalemi.
CREATE INDEX idx_pharmacy_coords ON pharmacy (lat, lng);
