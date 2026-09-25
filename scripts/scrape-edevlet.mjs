#!/usr/bin/env node
/**
 * e-Devlet TİTCK nöbetçi eczane çekimi (ADR-005, ADR-006).
 *
 *   npm run scrape -- <il> <gun>
 *
 *   il   plaka kodu (7), slug (antalya) ya da `tum` (81 il)
 *   gun  bugun | yarin | ikisi        ← kaynak yalnızca bu iki günü veriyor
 *
 * Örnekler:
 *   npm run scrape -- antalya bugun
 *   npm run scrape -- tum ikisi                     günlük otomatik koşunun kendisi
 *   npm run scrape -- 7 yarin --dry-run             yazma, sadece göster
 *   npm run scrape -- tum ikisi --api https://nobetci-eczane.becayisler.com
 *
 * Veriyi kendi admin API'mizin /api/admin/import ucuna yazar — böylece aynı
 * doğrulama, çakışma ve denetim yolu kullanılır ve komut hem yerelde hem
 * production'a karşı çalışır. Doğrudan D1'e yazmaz.
 *
 * TEKRAR ÇALIŞTIRMAK GÜVENLİDİR. Aynı il-gün ikinci kez çekilirse yeni nöbet
 * satırı açılmaz: `duty_shift` üzerinde `UNIQUE (duty_date, pharmacy_id)` var ve
 * içe aktarma o il-günün önceki `edevlet` nöbetlerini silip yeniden yazıyor.
 * Elle girilen nöbetlere ve koordinatlara dokunulmaz.
 *
 * KAYNAĞA SAYGI (ADR-005):
 *  - istekler sıralı, aralıklı (--delay, varsayılan 800 ms)
 *  - koordinat isteği YALNIZCA koordinatı bilinmeyen eczaneler için
 *  - koşu başına toplam koordinat bütçesi (--coord-budget) — backfill günlere yayılır
 *  - kendini tanıtan User-Agent
 *  - 429/5xx görülürse tüm koşu durur, yeniden denenmez
 */

import { slugify, pharmacySlug } from '../src/shared/slug.ts';

const BASE = 'https://www.turkiye.gov.tr';
const PATH = '/saglik-titck-nobetci-eczane-sorgulama';

const UA =
  'nobetci-eczane/0.1 (+https://nobetci-eczane.becayisler.com; nobetci eczane bilgilendirme servisi)';

// ─── Argümanlar ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? (argv[i + 1]?.startsWith('--') === false ? argv[++i] : true);
    } else positional.push(a);
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));

if (positional.length < 1 || flags.help) {
  process.stderr.write(
    `\nKullanım: npm run scrape -- <il> [gun]\n\n` +
      `  il    plaka kodu (7), slug (antalya) ya da "tum" (81 il)\n` +
      `  gun   bugun | yarin | ikisi (varsayılan: bugun)\n\n` +
      `Seçenekler:\n` +
      `  --dry-run           hiçbir şey yazma, ne bulduğunu göster\n` +
      `  --api <url>         API adresi (varsayılan http://localhost:5173)\n` +
      `  --user <ad>         panel kullanıcı adı (varsayılan ADMIN_USERNAME ortam değişkeni)\n` +
      `  --pass <parola>     panel parolası (verilmezse ADMIN_PASSWORD ortam değişkeni)\n` +
      `  --delay <ms>        istekler arası bekleme (varsayılan 800)\n` +
      `  --max-coords <n>    il-gün başına koordinat isteği (varsayılan 200)\n` +
      `  --coord-budget <n>  KOŞU başına toplam koordinat isteği (varsayılan 3000)\n\n`,
  );
  process.exit(positional.length < 1 ? 1 : 0);
}

const [ilArg, gunArg = 'bugun'] = positional;

const DAYS = { bugun: ['bugun'], yarin: ['yarin'], ikisi: ['bugun', 'yarin'] }[gunArg];

if (!DAYS) {
  process.stderr.write(`Gün "bugun", "yarin" ya da "ikisi" olmalı, "${gunArg}" verildi.\n`);
  process.stderr.write(`Kaynak yalnızca bugünü ve yarını sunuyor; geçmiş sorgulanamıyor.\n`);
  process.exit(1);
}

const API = String(flags.api ?? 'http://localhost:5173').replace(/\/$/, '');
const DELAY = Number(flags.delay ?? 800);
const MAX_COORDS = Number(flags['max-coords'] ?? 200);
const DRY = Boolean(flags['dry-run']);

/** Koşunun tamamı için koordinat isteği bütçesi. */
let coordBudget = Number(flags['coord-budget'] ?? 3000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** D1'e giren zaman damgası milisaniyesiz olmalı (CLAUDE.md kota kuralı). */
const isoSeconds = (d = new Date()) => `${d.toISOString().slice(0, 19)}Z`;

// ─── Çerez kavanozu ─────────────────────────────────────────────────────────
// `?harita=Goster&index=N` OTURUMA BAĞLIDIR: index son POST'un sonuç
// kümesindeki satır sırasını gösterir. Çerez kaybolursa yanlış eczanenin
// koordinatı alınır — bu yüzden her il-gün SIRAYLA yapılır ve koordinat
// istekleri kendi POST'unun hemen ardından gelir.

const jar = new Map();

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

let requestCount = 0;

/** Kaynak zorlanıyor: TÜM koşu durur (ADR-005). Diğer hatalar il bazında yutulur. */
class SourceBackoff extends Error {}

async function req(url, init = {}) {
  if (requestCount > 0) await sleep(DELAY);
  requestCount++;

  let res;
  try {
    res = await fetch(url, {
      ...init,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'tr-TR,tr;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
        ...(jar.size ? { Cookie: cookieHeader() } : {}),
        ...init.headers,
      },
    });
  } catch (e) {
    // Ağ katmanı çöktüyse kaynağı zorlamanın anlamı yok.
    throw new SourceBackoff(`Kaynağa ulaşılamadı: ${e.message}`);
  }

  storeCookies(res);

  // Kaynak zorlanıyorsa GERİ ÇEKİL. Yeniden deneme yok (ADR-005).
  if (res.status === 429 || res.status >= 500) {
    throw new SourceBackoff(`Kaynak ${res.status} döndü — geri çekiliyorum.`);
  }
  if (!res.ok) throw new Error(`Beklenmeyen yanıt: HTTP ${res.status} (${url})`);

  return res.text();
}

// ─── HTML ayrıştırma ────────────────────────────────────────────────────────
// Bağımlılık eklememek için regex. Kaynak HTML'i düzenli ve sabit; ayrıştırma
// başarısız olursa SESSİZCE GEÇMEZ, hata verir (ADR-005).

const stripTags = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();

function extractToken(html) {
  const m = html.match(/name="token"\s+value="([^"]+)"/i);
  if (!m) throw new Error('CSRF token bulunamadı — sayfa yapısı değişmiş olabilir.');
  return m[1];
}

/** `08:30 08/08/2026` → ISO UTC. Türkiye kalıcı UTC+3, yaz saati yok. */
function parseTrDateTime(text) {
  const m = text.match(/(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, hh, mi, dd, mm, yyyy] = m;
  const utcHour = Number(hh) - 3;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), utcHour, Number(mi)));
  return `${d.toISOString().slice(0, 19)}Z`;
}

/** `0 - (242) 678 - 1300` → `+902426781300` */
function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.replace(/^0+/, '');
  return local.length === 10 ? `+90${local}` : `+${digits}`;
}

/**
 * Bir satırın hücrelerini çıkarır.
 *
 * `<td>...</td>` eşleştirmesi KULLANILMAZ: kaynak bazı hücrelerde kapanış
 * etiketini yazmıyor (HTML buna izin verir) ve non-greedy eşleşme o durumda
 * sonraki kapanışa atlayıp üç hücreyi birleştiriyor. Bunun yerine AÇILIŞ
 * etiketinden bölünür — kapanış olsa da olmasa da doğru çalışır.
 */
function parseCells(rowHtml) {
  return rowHtml
    .split(/<td[^>]*>/i)
    .slice(1) // ilk parça ilk <td>'den önceki artık
    .map((part) => stripTags(part.split(/<\/td>/i)[0]));
}

function parseRows(html) {
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return [];

  const rows = [...tbody[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  return rows.map((r, index) => {
    const cells = parseCells(r[1]);
    return {
      index,
      districtName: cells[0] ?? '',
      name: cells[1] ?? '',
      address: cells[2] ?? '',
      phoneRaw: cells[3] ?? '',
      startRaw: cells[4] ?? '',
      endRaw: cells[5] ?? '',
      sourceStatus: cells[6] ?? '',
    };
  });
}

/**
 * Harita sayfasındaki inline Leaflet script'inden enlem/boylam.
 *
 * Kaynak şu biçimde yazıyor:
 *     var latti = parseFloat(36.85);
 *     var longi = parseFloat(30.7632);
 *
 * DEĞİŞKEN ADIYLA okunur, sayı aralığı tahminiyle DEĞİL. Enlem bazen 2 ondalıklı
 * geliyor (36.85) ve "4+ ondalık" gibi bir kalıp onu sessizce kaçırır — bu hata
 * bir kez yapıldı, 7 eczane koordinatsız kaldı.
 */
function parseCoords(html) {
  const num = (name) => {
    const m = html.match(
      new RegExp(`var\\s+${name}\\s*=\\s*parseFloat\\(\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'),
    );
    return m ? Number(m[1]) : null;
  };

  const lat = num('latti');
  const lng = num('longi');

  if (lat === null || lng === null) return null;
  // Türkiye kutusu dışındaysa güvenme — kaynak 0,0 gibi tutarsız değer verebilir.
  if (lat < 35.8 || lat > 42.2 || lng < 25.6 || lng > 44.9) return null;

  return { lat, lng };
}

// ─── API istemcisi ──────────────────────────────────────────────────────────

let apiCookie = '';

async function apiLogin() {
  const username = flags.user ?? process.env.ADMIN_USERNAME ?? 'admin';
  const password = flags.pass ?? process.env.ADMIN_PASSWORD ?? 'admin';

  const res = await fetch(`${API}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 204) {
    throw new Error(
      `Panel girişi başarısız (HTTP ${res.status}). --user/--pass ver ya da ` +
        `ADMIN_USERNAME / ADMIN_PASSWORD ortam değişkenlerini ayarla.`,
    );
  }
  apiCookie = (res.headers.getSetCookie?.()[0] ?? '').split(';')[0];
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: apiCookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: { Cookie: apiCookie } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/**
 * Koşu kaydını yazar. BAŞARISIZLIĞI KOŞUYU DURDURMAZ: defter tutulamadı diye
 * çekilmiş veri çöpe atılmaz, uyarı basılır.
 */
async function recordRun(run) {
  if (DRY) return;
  try {
    await apiPost('/api/admin/scrape/runs', run);
  } catch (e) {
    process.stderr.write(`  ! koşu kaydı yazılamadı: ${e.message}\n`);
  }
}

// ─── Tarih ──────────────────────────────────────────────────────────────────

/** Kaynağın istediği `GG/AA/YYYY` ve bizim `YYYY-MM-DD` biçimimiz. */
function resolveDate(gun) {
  const now = new Date();
  const target = new Date(now.getTime() + (gun === 'yarin' ? 86_400_000 : 0));
  const trt = new Date(target.getTime() + 3 * 3_600_000);
  const dd = String(trt.getUTCDate()).padStart(2, '0');
  const mm = String(trt.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = trt.getUTCFullYear();
  return { nobetTarihi: `${dd}/${mm}/${yyyy}`, dutyDate: `${yyyy}-${mm}-${dd}` };
}

// ─── Tek il-gün çekimi ──────────────────────────────────────────────────────

/**
 * Bir ilin bir gününü çeker ve yazar.
 * Dönen nesne özet tabloya ve `scrape_run` kaydına girer.
 * `SourceBackoff` fırlatırsa çağıran TÜM koşuyu durdurur.
 */
async function scrapeCityDay(city, gun) {
  const startedAt = isoSeconds();
  const { nobetTarihi, dutyDate } = resolveDate(gun);

  // 1) Form sayfası → çerez + token
  const formHtml = await req(`${BASE}${PATH}`);
  const token = extractToken(formHtml);

  // 2) Sorgu
  const body = new URLSearchParams({
    'ilkod-address-il': String(city.code),
    'ilkod-address-ilce': '', // boş → ilin tamamı
    'ilkod-full': '',
    ilkod: '',
    nobetTarihi,
    token,
    btn: 'Sorgula',
  });

  const resultHtml = await req(`${BASE}${PATH}?submit`, {
    method: 'POST',
    body: body.toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Referer: `${BASE}${PATH}`,
    },
  });

  const rows = parseRows(resultHtml);

  if (rows.length === 0) {
    // Sonuç yokluğu hata değil: küçük illerde o gün nöbetçi girilmemiş olabilir.
    await recordRun({ cityCode: city.code, dutyDate, startedAt, outcome: 'ok' });
    return { city, dutyDate, rowsFound: 0, skipped: 0, coordsFetched: 0, imported: null };
  }

  // 3) Normalize + eksik alan denetimi
  const skipped = [];
  const items = [];

  for (const r of rows) {
    const dutyStart = parseTrDateTime(r.startRaw);
    const dutyEnd = parseTrDateTime(r.endRaw);

    if (!r.name || !r.districtName || !r.address || !dutyStart || !dutyEnd) {
      skipped.push({ index: r.index, name: r.name || '(adsız)', reason: 'zorunlu alan eksik' });
      continue;
    }

    items.push({
      index: r.index,
      slug: pharmacySlug(city.slug, slugify(r.districtName), r.name),
      name: r.name,
      districtName: r.districtName,
      districtSlug: slugify(r.districtName),
      address: r.address,
      phone: normalizePhone(r.phoneRaw),
      dutyStart,
      dutyEnd,
      sourceStatus: r.sourceStatus || null,
      lat: null,
      lng: null,
    });
  }

  // Kaynak AYNI eczaneyi birden çok kez listeleyebiliyor (aynı ilçe, aynı ad,
  // aynı adres). Doğrulandı: Antalya/Muratpaşa "PINAR" üç kez geliyor.
  // Slug doğal anahtar olduğu için mükerrerler burada birleştirilir; ilk kayıt
  // tutulur (koordinat isteği için geçerli index'i o taşır).
  const bySlug = new Map();
  let duplicates = 0;
  for (const item of items) {
    if (bySlug.has(item.slug)) {
      duplicates++;
      continue;
    }
    bySlug.set(item.slug, item);
  }
  const unique = [...bySlug.values()];
  items.length = 0;
  items.push(...unique);

  if (items.length === 0) {
    // Sayfa değiştiğinde "bozuldu" demek yetmez — NEYİN bozulduğunu göster.
    const r = rows[0];
    throw new Error(
      `${rows.length} satır bulundu ama hiçbiri ayrıştırılamadı — sayfa yapısı değişmiş olabilir.\n` +
        `İlk satırda okunanlar:\n` +
        `  ilçe     : ${JSON.stringify(r.districtName)}\n` +
        `  ad       : ${JSON.stringify(r.name)}\n` +
        `  adres    : ${JSON.stringify(r.address)}\n` +
        `  telefon  : ${JSON.stringify(r.phoneRaw)}\n` +
        `  başlangıç: ${JSON.stringify(r.startRaw)} → ${parseTrDateTime(r.startRaw)}\n` +
        `  bitiş    : ${JSON.stringify(r.endRaw)} → ${parseTrDateTime(r.endRaw)}`,
    );
  }

  // 4) Hangi eczanelerin koordinatı ZATEN VAR — onlar için harita isteği YAPILMAZ
  let known = new Set();
  if (!DRY) {
    const res = await apiGet(
      `/api/admin/known-coords?city=${city.code}&slugs=${encodeURIComponent(
        items.map((i) => i.slug).join(','),
      )}`,
    );
    known = new Set(res.slugs);
  }

  const needCoords = items.filter((i) => !known.has(i.slug));
  const allowance = Math.max(0, Math.min(MAX_COORDS, coordBudget));
  // Dry-run koordinat İSTEMEZ: yazılmayacak bir veri için kaynağa yük bindirmek
  // ADR-005'in "gereksiz istek yaratma" kuralına aykırı.
  const toFetch = DRY ? [] : needCoords.slice(0, allowance);
  const deferred = needCoords.length - toFetch.length;

  let coordsFetched = 0;
  for (const item of toFetch) {
    try {
      const html = await req(`${BASE}${PATH}?harita=Goster&index=${item.index}`);
      coordBudget--;
      const c = parseCoords(html);
      if (c) {
        item.lat = c.lat;
        item.lng = c.lng;
        coordsFetched++;
      }
    } catch (e) {
      // Geri çekilme sinyali tüm koşuyu durdurur.
      if (e instanceof SourceBackoff) throw e;
      // Koordinat ikincil bilgidir: alınamazsa nöbet listesi yine de yazılır.
      // Eczane listede görünür, haritada görünmez; sonraki koşu tekrar dener.
      process.stderr.write(`  ! ${city.name} koordinat alınamadı: ${e.message}\n`);
      break;
    }
  }

  // 5) Yaz
  let imported = null;
  if (!DRY) {
    imported = await apiPost('/api/admin/import', {
      cityCode: city.code,
      dutyDate,
      source: 'edevlet',
      items: items.map(({ index: _i, ...rest }) => rest),
    });
  }

  await recordRun({
    cityCode: city.code,
    dutyDate,
    startedAt,
    outcome: skipped.length > 0 ? 'partial' : 'ok',
    rowsFound: rows.length,
    pharmaciesNew: imported?.pharmaciesCreated ?? 0,
    dutiesWritten: imported?.dutiesWritten ?? 0,
    coordsFetched,
    rowsSkipped: skipped.length,
    errorMessage: null,
  });

  return {
    city,
    dutyDate,
    rowsFound: rows.length,
    duplicates,
    skipped: skipped.length,
    skippedList: skipped,
    coordsFetched,
    deferred,
    imported,
  };
}

// ─── Ana akış ───────────────────────────────────────────────────────────────

async function main() {
  const allCities = await (async () => {
    const res = await fetch(`${API}/api/cities`);
    if (!res.ok) throw new Error(`İl listesi alınamadı (HTTP ${res.status}). API ayakta mı?`);
    return (await res.json()).items;
  })();

  const wantsAll = ['tum', 'tümü', 'tumu', 'all', 'turkiye', 'türkiye'].includes(
    ilArg.toLowerCase(),
  );

  let cities;
  if (wantsAll) {
    cities = allCities;
  } else {
    const one = /^\d+$/.test(ilArg)
      ? allCities.find((c) => c.code === Number(ilArg))
      : allCities.find((c) => c.slug === slugify(ilArg));
    if (!one) throw new Error(`İl bulunamadı: "${ilArg}". Plaka kodu, slug ya da "tum" ver.`);
    cities = [one];
  }

  console.log(
    `\n▸ ${cities.length} il × ${DAYS.length} gün` +
      `  ·  hedef: ${DRY ? '(dry-run — hiçbir şey yazılmayacak)' : API}`,
  );
  console.log(`  kaynak: ${BASE}${PATH}`);
  console.log(`  koordinat bütçesi: ${coordBudget} (il-gün başına en fazla ${MAX_COORDS})\n`);

  const results = [];
  const failures = [];
  let aborted = null;

  outer: for (const city of cities) {
    for (const gun of DAYS) {
      try {
        const r = await scrapeCityDay(city, gun);
        results.push(r);

        const line =
          `  ${city.name.padEnd(16)} ${r.dutyDate}  ` +
          `${String(r.rowsFound).padStart(3)} satır` +
          (r.coordsFetched ? `  +${r.coordsFetched} koordinat` : '') +
          (r.deferred ? `  (${r.deferred} koordinat sonraya)` : '') +
          (r.skipped ? `  ${r.skipped} atlandı` : '');
        console.log(line);
      } catch (e) {
        if (e instanceof SourceBackoff) {
          aborted = e.message;
          break outer;
        }

        // Tek il bozuldu diye 80 il çekilmeden kalmaz.
        failures.push({ city, gun, message: e.message });
        console.warn(`  ${city.name.padEnd(16)} — HATA: ${e.message.split('\n')[0]}`);

        await recordRun({
          cityCode: city.code,
          dutyDate: resolveDate(gun).dutyDate,
          startedAt: isoSeconds(),
          outcome: 'error',
          errorMessage: e.message.slice(0, 500),
        });
      }
    }
  }

  return { results, failures, aborted, cityCount: cities.length };
}

// ─── Çalıştır ───────────────────────────────────────────────────────────────

try {
  if (!DRY) await apiLogin();
  const { results, failures, aborted, cityCount } = await main();

  const sum = (f) => results.reduce((n, r) => n + (f(r) ?? 0), 0);

  console.log('\n─────────────────────────────────');
  console.log(`  il × gün          ${results.length} / ${cityCount * DAYS.length}`);
  console.log(`  kaynaktan satır   ${sum((r) => r.rowsFound)}`);
  console.log(`  atlanan           ${sum((r) => r.skipped)}`);
  console.log(`  koordinat çekildi ${sum((r) => r.coordsFetched)}`);
  console.log(`  koordinat kaldı   ${sum((r) => r.deferred)}`);
  if (!DRY) {
    console.log(`  yeni eczane       ${sum((r) => r.imported?.pharmaciesCreated)}`);
    console.log(`  nöbet yazıldı     ${sum((r) => r.imported?.dutiesWritten)}`);
    console.log(`  korunan koordinat ${sum((r) => r.imported?.coordsPreserved)}`);
  }
  console.log(`  kaynağa istek     ${requestCount}`);
  console.log('─────────────────────────────────\n');

  const skippedRows = results.flatMap((r) => (r.skippedList ?? []).map((s) => ({ ...s, r })));
  if (skippedRows.length > 0) {
    console.warn('Atlanan satırlar:');
    for (const s of skippedRows) {
      console.warn(`  ${s.r.city.name} #${s.index} ${s.name} — ${s.reason}`);
    }
    console.warn('');
  }

  if (aborted) {
    process.stderr.write(`KAYNAK GERİ ÇEKİLME İSTEDİ: ${aborted}\n`);
    process.stderr.write(`Buraya kadar çekilenler yazıldı. Bir süre sonra tekrar dene.\n\n`);
    process.exit(1);
  }

  if (failures.length > 0) {
    console.warn(`${failures.length} il-gün çekilemedi:`);
    for (const f of failures) console.warn(`  ${f.city.name} (${f.gun}) — ${f.message}`);
    console.warn('');
    process.exit(2); // sessizce başarılı sayma
  }

  if (skippedRows.length > 0) process.exit(2);
} catch (e) {
  process.stderr.write(`\nHATA: ${e.message}\n\n`);
  process.exit(1);
}
