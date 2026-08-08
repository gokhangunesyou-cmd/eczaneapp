-- 0001_init — temel şema
--
-- Veri girişi admin panelinden yapılır (ADR-004). D1 sistemin kayıt otoritesidir.
-- Zamanlar ISO 8601 / UTC metin olarak saklanır; Türkiye kalıcı UTC+3, yaz saati yok.

-- ─── İlçeler ───────────────────────────────────────────────────────────────
-- Sabit referans veri. 0002 migration'ında Antalya ilçeleri yüklenir.
CREATE TABLE district (
  code        TEXT PRIMARY KEY,           -- TÜİK ilçe kodu, 4 hane: '0715'
  city_code   INTEGER NOT NULL,           -- plaka kodu: 7
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_district_city ON district (city_code, sort_order);

-- ─── Eczaneler ─────────────────────────────────────────────────────────────
-- Eczanenin kendisi. Nöbette olup olmadığından bağımsız kalıcı kayıt.
CREATE TABLE pharmacy (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  phone         TEXT,                     -- E.164: '+902422371414'
  address       TEXT    NOT NULL,
  district_code TEXT    NOT NULL REFERENCES district (code) ON DELETE RESTRICT,
  lat           REAL    NOT NULL,
  lng           REAL    NOT NULL,
  notes         TEXT,                     -- yalnızca panelde görünür
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  -- Koordinatsız eczane haritada gösterilemez; ADR-001 sözleşme kuralı.
  CHECK (lat BETWEEN 35.8 AND 42.2),
  CHECK (lng BETWEEN 25.6 AND 44.9)
);

-- Aynı ilçede aynı adlı ikinci eczane kazara girilmesin (409 döndürülür).
CREATE UNIQUE INDEX idx_pharmacy_unique ON pharmacy (district_code, name);
CREATE INDEX idx_pharmacy_district ON pharmacy (district_code);

-- ─── Nöbet atamaları ───────────────────────────────────────────────────────
-- Bir eczanenin bir güne ait nöbeti. Pencere: o gün 08:00 TRT → ertesi gün 08:00 TRT.
CREATE TABLE duty_shift (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacy (id) ON DELETE CASCADE,
  duty_date   TEXT    NOT NULL,           -- 'YYYY-MM-DD' (TRT günü)
  duty_start  TEXT    NOT NULL,           -- ISO 8601 UTC
  duty_end    TEXT    NOT NULL,           -- ISO 8601 UTC
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by  TEXT,                       -- panel kullanıcı adı

  CHECK (duty_end > duty_start)
);

-- Aynı eczaneye aynı gün için ikinci atama yapılamaz (409 döndürülür).
CREATE UNIQUE INDEX idx_duty_unique ON duty_shift (duty_date, pharmacy_id);

-- Genel API'nin sıcak sorgusu: "şu an nöbette olanlar".
-- duty_start/duty_end üzerinden aralık taraması yapar.
CREATE INDEX idx_duty_window ON duty_shift (duty_start, duty_end);
CREATE INDEX idx_duty_date ON duty_shift (duty_date);

-- ─── Denetim kaydı ─────────────────────────────────────────────────────────
-- Panelden yapılan her yazma işlemi buraya düşer.
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor       TEXT    NOT NULL,           -- panel kullanıcı adı
  action      TEXT    NOT NULL,           -- 'pharmacy.create' | 'duty.delete' | ...
  entity_id   INTEGER,
  detail      TEXT                        -- kısa JSON özet
);

CREATE INDEX idx_audit_at ON audit_log (at DESC);
