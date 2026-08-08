-- 0003 — e-Devlet kaynağına geçiş (ADR-005)
--
-- Değişenler:
--   1. `city` tablosu eklendi — 81 il, plaka kodu birincil anahtar.
--   2. `district` yeniden kuruldu: kod artık e-Devlet'in ilçe kodu ('1121'),
--      TÜİK kodu değil. İlçeler artık çekim sırasında da eklenebiliyor.
--   3. `pharmacy`: slug doğal anahtar eklendi; lat/lng ARTIK NULL olabilir
--      (koordinat ayrı bir istekle geliyor, ilk anda bilinmiyor olabilir);
--      koordinatın kaynağı işaretleniyor ki elle düzeltme ezilmesin.
--   4. `duty_shift`: nöbet saatleri artık HESAPLANMIYOR, kaynaktan okunuyor
--      (Antalya'da 08:30). Kaynak ve ham durum bilgisi saklanıyor.
--
-- Eski `district` kodları (TÜİK) ile yeni kodlar uyuşmadığı için eczane ve
-- nöbet kayıtları temizleniyor. Production'a hiç deploy edilmediği ve yereldeki
-- veri sahte olduğu için kayıp yok.

PRAGMA foreign_keys = OFF;

DELETE FROM duty_shift;
DELETE FROM pharmacy;
DELETE FROM district;

-- ─── İller ─────────────────────────────────────────────────────────────────
-- Plaka kodu = e-Devlet'in `ilkod-address-il` option değeri. Birebir aynı.
CREATE TABLE city (
  code INTEGER PRIMARY KEY,
  name TEXT    NOT NULL,
  slug TEXT    NOT NULL UNIQUE
);

INSERT INTO city (code, name, slug) VALUES
  (1,'Adana','adana'),(2,'Adıyaman','adiyaman'),(3,'Afyonkarahisar','afyonkarahisar'),
  (4,'Ağrı','agri'),(5,'Amasya','amasya'),(6,'Ankara','ankara'),(7,'Antalya','antalya'),
  (8,'Artvin','artvin'),(9,'Aydın','aydin'),(10,'Balıkesir','balikesir'),
  (11,'Bilecik','bilecik'),(12,'Bingöl','bingol'),(13,'Bitlis','bitlis'),
  (14,'Bolu','bolu'),(15,'Burdur','burdur'),(16,'Bursa','bursa'),
  (17,'Çanakkale','canakkale'),(18,'Çankırı','cankiri'),(19,'Çorum','corum'),
  (20,'Denizli','denizli'),(21,'Diyarbakır','diyarbakir'),(22,'Edirne','edirne'),
  (23,'Elazığ','elazig'),(24,'Erzincan','erzincan'),(25,'Erzurum','erzurum'),
  (26,'Eskişehir','eskisehir'),(27,'Gaziantep','gaziantep'),(28,'Giresun','giresun'),
  (29,'Gümüşhane','gumushane'),(30,'Hakkâri','hakkari'),(31,'Hatay','hatay'),
  (32,'Isparta','isparta'),(33,'Mersin','mersin'),(34,'İstanbul','istanbul'),
  (35,'İzmir','izmir'),(36,'Kars','kars'),(37,'Kastamonu','kastamonu'),
  (38,'Kayseri','kayseri'),(39,'Kırklareli','kirklareli'),(40,'Kırşehir','kirsehir'),
  (41,'Kocaeli','kocaeli'),(42,'Konya','konya'),(43,'Kütahya','kutahya'),
  (44,'Malatya','malatya'),(45,'Manisa','manisa'),(46,'Kahramanmaraş','kahramanmaras'),
  (47,'Mardin','mardin'),(48,'Muğla','mugla'),(49,'Muş','mus'),
  (50,'Nevşehir','nevsehir'),(51,'Niğde','nigde'),(52,'Ordu','ordu'),
  (53,'Rize','rize'),(54,'Sakarya','sakarya'),(55,'Samsun','samsun'),
  (56,'Siirt','siirt'),(57,'Sinop','sinop'),(58,'Sivas','sivas'),
  (59,'Tekirdağ','tekirdag'),(60,'Tokat','tokat'),(61,'Trabzon','trabzon'),
  (62,'Tunceli','tunceli'),(63,'Şanlıurfa','sanliurfa'),(64,'Uşak','usak'),
  (65,'Van','van'),(66,'Yozgat','yozgat'),(67,'Zonguldak','zonguldak'),
  (68,'Aksaray','aksaray'),(69,'Bayburt','bayburt'),(70,'Karaman','karaman'),
  (71,'Kırıkkale','kirikkale'),(72,'Batman','batman'),(73,'Şırnak','sirnak'),
  (74,'Bartın','bartin'),(75,'Ardahan','ardahan'),(76,'Iğdır','igdir'),
  (77,'Yalova','yalova'),(78,'Karabük','karabuk'),(79,'Kilis','kilis'),
  (80,'Osmaniye','osmaniye'),(81,'Düzce','duzce');

-- ─── İlçeler ───────────────────────────────────────────────────────────────
-- Kod = e-Devlet ilçe kodu. Çekim sırasında bilinmeyen ilçe görülürse eklenir.
DROP INDEX IF EXISTS idx_district_city;
DROP TABLE district;

CREATE TABLE district (
  code       TEXT    PRIMARY KEY,
  city_code  INTEGER NOT NULL REFERENCES city (code) ON DELETE RESTRICT,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  UNIQUE (city_code, slug)
);

CREATE INDEX idx_district_city ON district (city_code, sort_order, name);

-- Antalya ilçeleri — e-Devlet'in kendi kodlarıyla (tarayıcıda doğrulandı).
INSERT INTO district (code, city_code, name, slug) VALUES
  ('1121',7,'Akseki','akseki'),      ('2035',7,'Aksu','aksu'),
  ('1126',7,'Alanya','alanya'),      ('1811',7,'Demre','demre'),
  ('2036',7,'Döşemealtı','dosemealti'),('1303',7,'Elmalı','elmali'),
  ('1359',7,'Finike','finike'),      ('1391',7,'Gazipaşa','gazipasa'),
  ('1412',7,'Gündoğmuş','gundogmus'),('1471',7,'İbradı','ibradi'),
  ('1546',7,'Kaş','kas'),            ('1571',7,'Kemer','kemer'),
  ('1583',7,'Kepez','kepez'),        ('1609',7,'Konyaaltı','konyaalti'),
  ('1616',7,'Korkuteli','korkuteli'),('1641',7,'Kumluca','kumluca'),
  ('1735',7,'Manavgat','manavgat'),  ('2037',7,'Muratpaşa','muratpasa'),
  ('1962',7,'Serik','serik');

-- ─── Eczaneler ─────────────────────────────────────────────────────────────
-- slug doğal anahtardır: 'antalya/akseki/murtici'. Aynı slug tekrar gelirse
-- yeni kayıt açılmaz, mevcut güncellenir.
--
-- lat/lng NULL OLABİLİR: koordinat kaynakta ayrı bir istekle geliyor ve ilk
-- görüldüğünde henüz bilinmiyor olabilir. Koordinatsız eczane listede görünür,
-- haritada görünmez.
CREATE TABLE pharmacy_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  phone         TEXT,
  address       TEXT    NOT NULL,
  district_code TEXT    NOT NULL REFERENCES district (code) ON DELETE RESTRICT,
  lat           REAL,
  lng           REAL,
  -- 'edevlet' → kaynaktan geldi, çekim güncelleyebilir
  -- 'manual'  → panelden girildi, çekim ASLA ezmez
  coord_source  TEXT    NOT NULL DEFAULT 'edevlet'
                        CHECK (coord_source IN ('edevlet', 'manual')),
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  CHECK (lat IS NULL OR lat BETWEEN 35.8 AND 42.2),
  CHECK (lng IS NULL OR lng BETWEEN 25.6 AND 44.9),
  -- İkisi birlikte dolu ya da birlikte boş olmalı; yarım koordinat anlamsız.
  CHECK ((lat IS NULL) = (lng IS NULL))
);

DROP INDEX IF EXISTS idx_pharmacy_unique;
DROP INDEX IF EXISTS idx_pharmacy_district;
DROP TABLE pharmacy;
ALTER TABLE pharmacy_new RENAME TO pharmacy;

CREATE INDEX idx_pharmacy_district ON pharmacy (district_code, name);
-- Çekim "koordinatı olmayanlar" sorgusunu her koşuda atıyor.
CREATE INDEX idx_pharmacy_nocoord ON pharmacy (id) WHERE lat IS NULL;

-- ─── Nöbet atamaları ───────────────────────────────────────────────────────
-- duty_start/duty_end artık HESAPLANMIYOR, kaynaktan okunuyor.
CREATE TABLE duty_shift_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacy (id) ON DELETE CASCADE,
  duty_date   TEXT    NOT NULL,
  duty_start  TEXT    NOT NULL,
  duty_end    TEXT    NOT NULL,
  -- Kaynaktaki "Durumu" sütunu ham hâliyle ('Onaylanmış' vb.)
  source_status TEXT,
  source      TEXT    NOT NULL DEFAULT 'edevlet'
                      CHECK (source IN ('edevlet', 'manual')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by  TEXT,

  CHECK (duty_end > duty_start)
);

DROP INDEX IF EXISTS idx_duty_unique;
DROP INDEX IF EXISTS idx_duty_window;
DROP INDEX IF EXISTS idx_duty_date;
DROP TABLE duty_shift;
ALTER TABLE duty_shift_new RENAME TO duty_shift;

CREATE UNIQUE INDEX idx_duty_unique ON duty_shift (duty_date, pharmacy_id);
CREATE INDEX idx_duty_window ON duty_shift (duty_start, duty_end);
CREATE INDEX idx_duty_date ON duty_shift (duty_date);

-- ─── Çekim koşuları ────────────────────────────────────────────────────────
-- Her komut çalıştırmasının izi. Kaynağa ne kadar yük bindirdiğimizi görmek ve
-- sessiz bozulmayı yakalamak için.
CREATE TABLE scrape_run (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  city_code      INTEGER NOT NULL,
  duty_date      TEXT    NOT NULL,
  started_at     TEXT    NOT NULL,
  finished_at    TEXT,
  outcome        TEXT    NOT NULL DEFAULT 'running',
  rows_found     INTEGER NOT NULL DEFAULT 0,
  pharmacies_new INTEGER NOT NULL DEFAULT 0,
  duties_written INTEGER NOT NULL DEFAULT 0,
  coords_fetched INTEGER NOT NULL DEFAULT 0,
  rows_skipped   INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT
);

CREATE INDEX idx_scrape_started ON scrape_run (started_at DESC);

PRAGMA foreign_keys = ON;
