#!/usr/bin/env node
/**
 * eczaneler.gen.tr nöbetçi eczane çekimi (ADR-007).
 *
 *   npm run scrape -- <il> [gun]
 *
 *   il   plaka kodu (7), slug (antalya) ya da `tum` (81 il)
 *   gun  yalnızca `bugun` — kaynak başka gün sunmuyor, ayrıntı aşağıda
 *
 * Örnekler:
 *   npm run scrape -- antalya
 *   npm run scrape -- tum bugun                     günlük otomatik koşunun kendisi
 *   npm run scrape -- 7 --dry-run --sample 3        yazma, ne bulduğunu göster
 *   npm run scrape -- tum bugun --api https://nobetcieczane.becayisler.com
 *
 * NEDEN e-DEVLET DEĞİL (ADR-007): e-Devlet koordinatı ayrı bir istekle, oturuma
 * bağlı `?harita=Goster&index=N` ucundan veriyordu — eczane başına bir istek.
 * 81 ilin koordinatı ancak günlere yayılan bir bütçeyle toplanabiliyordu. Bu
 * kaynak koordinatı listenin İÇİNDE veriyor: il başına TEK istek. Ölçüldü —
 * 81 il, 1371 eczane, %98'i koordinatlı, 81 istek.
 *
 * KAYNAĞIN İKİ SINIRI, İKİSİ DE BİLİNÇLİ KABUL EDİLDİ:
 *  1. YALNIZCA BUGÜN. `tarih`, `gun` gibi parametreler yok sayılıyor — denendi,
 *     yanıtlar bayt bayt aynı geliyor. Bu yüzden çekim rotasyondan hemen sonra
 *     koşar (workflow'da 05:15Z = 08:15 TRT) ve o günün listesini yazar.
 *  2. NÖBET SAATİ YOK. Saatler uydurulmuyor; projenin kendi rotasyon modelinden
 *     türetiliyor — gerekçe `scripts/lib/eczaneler-parse.mjs`'te.
 *
 * Veriyi kendi admin API'mizin /api/admin/import ucuna yazar — aynı doğrulama,
 * çakışma ve denetim yolu. Doğrudan D1'e yazmaz.
 *
 * TEKRAR ÇALIŞTIRMAK GÜVENLİDİR. `duty_shift` üzerinde `UNIQUE (duty_date,
 * pharmacy_id)` var ve içe aktarma o il-günün önceki otomatik nöbetlerini silip
 * yeniden yazıyor. Elle girilen nöbetlere ve koordinatlara dokunulmaz.
 *
 * KAYNAĞA SAYGI: istekler sıralı ve aralıklı (--delay, varsayılan 800 ms),
 * kendini tanıtan User-Agent, 429/5xx görülürse tüm koşu durur.
 */

import { slugify } from '../src/shared/slug.ts';
import { dutyDateOf, isoSeconds } from '../src/shared/duty.ts';
import { parseCity, parseHeaderDate, toImportItems } from './lib/eczaneler-parse.mjs';

const BASE = 'https://www.eczaneler.gen.tr';
const PATH = '/iframe.php';

const UA =
  'nobetci-eczane/0.1 (+https://nobetcieczane.becayisler.com; nobetci eczane bilgilendirme servisi)';

/** İçe aktarma şeması tek çağrıda 500 kayıtla sınırlı. */
const IMPORT_CHUNK = 400;

/**
 * Bu kadar il üst üste başarısız olursa koşu durur.
 *
 * Tek ilin bozulması normaldir; arka arkaya beşi bozulmuyor. Böyle bir dizi
 * "kaynak bize kapalı" demektir ve devam etmek kaynağa 80 gereksiz istek daha
 * yollamak olur.
 */
const CONSECUTIVE_FAILURE_LIMIT = 5;

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
      `  gun   yalnızca "bugun" — kaynak yarını sunmuyor\n\n` +
      `Seçenekler:\n` +
      `  --dry-run        hiçbir şey yazma, ne bulduğunu göster\n` +
      `  --sample <n>     ayrıştırılan ilk n kaydı JSON olarak bas\n` +
      `  --api <url>      API adresi (varsayılan http://localhost:5173)\n` +
      `  --user <ad>      panel kullanıcı adı (varsayılan ADMIN_USERNAME)\n` +
      `  --pass <parola>  panel parolası (varsayılan ADMIN_PASSWORD)\n` +
      `  --delay <ms>     istekler arası bekleme (varsayılan 800)\n\n`,
  );
  process.exit(positional.length < 1 ? 1 : 0);
}

const [ilArg, gunArg = 'bugun'] = positional;

// Panel düğmesi ve eski workflow "ikisi"/"yarin" gönderebiliyor. Sessizce
// bugüne düşmek yanlış olurdu — ne olduğu SÖYLENİR, koşu devam eder.
if (gunArg !== 'bugun') {
  process.stderr.write(
    `Not: "${gunArg}" istendi ama bu kaynak yalnızca bugünü veriyor; bugün çekiliyor.\n`,
  );
}

const API = String(flags.api ?? 'http://localhost:5173').replace(/\/$/, '');
const DELAY = Number(flags.delay ?? 800);
const DRY = Boolean(flags['dry-run']);
/** Ayrıştırmayı gözle doğrulamak için: il başına ilk n kaydı JSON basar. */
const SAMPLE = Number(flags.sample ?? 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Kaynağa istek ──────────────────────────────────────────────────────────

let requestCount = 0;

/** Kaynak zorlanıyor: TÜM koşu durur. Diğer hatalar il bazında yutulur. */
class SourceBackoff extends Error {}

const SCRAPER_KEY =
  flags['scraperapi-key'] ?? process.env.SCRAPERAPI_KEY ?? 'fa9fdd79addee111a7a7da600e573066';

async function fetchCity(cityCode) {
  if (requestCount > 0) await sleep(DELAY);
  requestCount++;

  const rawUrl = `${BASE}${PATH}?lokasyon=${cityCode}`;
  const targetUrl = SCRAPER_KEY
    ? `https://api.scraperapi.com?api_key=${encodeURIComponent(SCRAPER_KEY)}&url=${encodeURIComponent(rawUrl)}`
    : rawUrl;

  let res;
  try {
    res = await fetch(targetUrl, {
      redirect: 'follow',
      ...(SCRAPER_KEY
        ? {}
        : {
            headers: {
              'User-Agent': UA,
              'Accept-Language': 'tr-TR,tr;q=0.9',
              Accept: 'text/html,application/xhtml+xml',
            },
          }),
    });
  } catch (e) {
    const cause = e.cause ? ` [cause: ${e.cause.message ?? e.cause.code ?? e.cause}]` : '';
    throw new SourceBackoff(`Kaynağa ulaşılamadı: ${e.message}${cause}`);
  }

  if (res.status === 429 || res.status >= 500) {
    throw new SourceBackoff(`Kaynak ${res.status} döndü — geri çekiliyorum.`);
  }
  if (!res.ok) throw new Error(`Beklenmeyen yanıt: HTTP ${res.status}`);

  return res.text();
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

/** Koşu kaydını yazar. Başarısızlığı koşuyu DURDURMAZ. */
async function recordRun(run) {
  if (DRY) return;
  try {
    await apiPost('/api/admin/scrape/runs', run);
  } catch (e) {
    process.stderr.write(`  ! koşu kaydı yazılamadı: ${e.message}\n`);
  }
}

// ─── Tek il çekimi ──────────────────────────────────────────────────────────

async function scrapeCity(city, now) {
  const startedAt = isoSeconds(now);

  // Nöbet günü BİZİM rotasyon modelimizden gelir, kaynağın başlığından değil:
  // okuma yolu (`/api/pharmacies/on-duty`) hangi günü sorguluyorsa veri o güne
  // yazılmalı. Başlık yine de okunur ve uyuşmazsa uyarı basılır — kaynağın
  // rotasyon saati bizimkinden kayarsa bunu sessizce yaşamayalım.
  const dutyDate = dutyDateOf(now);

  const html = await fetchCity(city.code);

  const headerDate = parseHeaderDate(html, now);
  if (headerDate !== null && headerDate !== dutyDate) {
    process.stderr.write(
      `  ! ${city.name}: kaynak ${headerDate} diyor, biz ${dutyDate} yazıyoruz ` +
        `(rotasyon saati kaymış olabilir).\n`,
    );
  }

  const rows = parseCity(html, city.name);

  if (rows.length === 0) {
    // Sonuç yokluğu hata DEĞİL: küçük illerde o gün nöbetçi girilmemiş olabilir.
    // Ama yapı değiştiyse de burası 0 döner — ikisini beklenen iskeletin
    // varlığına bakarak ayırt ediyoruz.
    if (!/<tbody>/i.test(html)) {
      throw new Error('Sayfada tablo yok — kaynağın yapısı değişmiş olabilir.');
    }
    await recordRun({ cityCode: city.code, dutyDate, startedAt, outcome: 'ok' });
    return { city, dutyDate, rowsFound: 0, skipped: 0, withCoords: 0, imported: null };
  }

  const { items, skipped, duplicates } = toImportItems(rows, city, dutyDate);

  if (items.length === 0) {
    const r = rows[0];
    throw new Error(
      `${rows.length} blok bulundu ama hiçbiri ayrıştırılamadı — yapı değişmiş olabilir.\n` +
        `İlk blokta okunanlar:\n` +
        `  ad      : ${JSON.stringify(r.name)}\n` +
        `  ilçe    : ${JSON.stringify(r.districtName)}\n` +
        `  adres   : ${JSON.stringify(r.address)}\n` +
        `  telefon : ${JSON.stringify(r.phoneRaw)}`,
    );
  }

  if (SAMPLE > 0) console.log(JSON.stringify(items.slice(0, SAMPLE), null, 2));

  const withCoords = items.filter((i) => i.lat !== null).length;

  let imported = null;
  if (!DRY) {
    imported = {
      districtsCreated: 0,
      pharmaciesCreated: 0,
      pharmaciesUpdated: 0,
      dutiesWritten: 0,
      dutiesRemoved: 0,
      coordsPreserved: 0,
    };
    for (let i = 0; i < items.length; i += IMPORT_CHUNK) {
      const part = await apiPost('/api/admin/import', {
        cityCode: city.code,
        dutyDate,
        // Şemadaki 'edevlet' değeri "otomatik çekim" kovasıdır: elle girilenden
        // (manual) ayırır, kaynağın adını taşımaz. ADR-007'de kayıtlı.
        source: 'edevlet',
        items: items.slice(i, i + IMPORT_CHUNK),
      });
      for (const k of Object.keys(imported)) imported[k] += part[k] ?? 0;
    }
  }

  await recordRun({
    cityCode: city.code,
    dutyDate,
    startedAt,
    outcome: skipped.length > 0 ? 'partial' : 'ok',
    rowsFound: rows.length,
    pharmaciesNew: imported?.pharmaciesCreated ?? 0,
    dutiesWritten: imported?.dutiesWritten ?? 0,
    coordsFetched: withCoords,
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
    withCoords,
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

  // Nöbet günü koşunun BAŞINDA sabitlenir: 81 il yaklaşık iki dakika sürüyor ve
  // koşu 08:00 TRT'yi ortasından bölerse yarısı bir güne, yarısı diğerine yazılır.
  const now = new Date();

  console.log(
    `\n▸ ${cities.length} il  ·  nöbet günü ${dutyDateOf(now)}` +
      `  ·  hedef: ${DRY ? '(dry-run — hiçbir şey yazılmayacak)' : API}`,
  );
  console.log(`  kaynak: ${BASE}${PATH}?lokasyon=<plaka>\n`);

  const results = [];
  const failures = [];
  let aborted = null;
  let consecutive = 0;

  for (const city of cities) {
    try {
      const r = await scrapeCity(city, now);
      results.push(r);
      consecutive = 0;
      console.log(
        `  ${city.name.padEnd(16)} ${String(r.rowsFound).padStart(3)} eczane` +
          `  ${String(r.withCoords).padStart(3)} koordinat` +
          (r.duplicates ? `  ${r.duplicates} mükerrer` : '') +
          (r.skipped ? `  ${r.skipped} atlandı` : ''),
      );
    } catch (e) {
      if (e instanceof SourceBackoff) {
        aborted = e.message;
        break;
      }

      // Tek il bozuldu diye 80 il çekilmeden kalmaz.
      failures.push({ city, message: e.message });
      console.warn(`  ${city.name.padEnd(16)} — HATA: ${e.message.split('\n')[0]}`);

      await recordRun({
        cityCode: city.code,
        dutyDate: dutyDateOf(now),
        startedAt: isoSeconds(new Date()),
        outcome: 'error',
        errorMessage: e.message.slice(0, 500),
      });

      // Arka arkaya hata artık "tek il bozuk" değildir: kaynak bize kapalı.
      // Devam etmek 80 kez daha kapıya vurmak olur. Bir kez yaşandı — Actions
      // runner'ı 403 yerken 81 ilin hepsi tek tek denendi (ADR-007).
      if (++consecutive >= CONSECUTIVE_FAILURE_LIMIT) {
        aborted =
          `${consecutive} il üst üste başarısız (son hata: ${e.message.split('\n')[0]}) — ` +
          `kaynak bu ortamdan erişilebilir değil, kalan iller denenmiyor.`;
        break;
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
  const rows = sum((r) => r.rowsFound);
  const coords = sum((r) => r.withCoords);

  console.log('\n─────────────────────────────────');
  console.log(`  il                ${results.length} / ${cityCount}`);
  console.log(`  kaynaktan eczane  ${rows}`);
  console.log(
    `  koordinatlı       ${coords}${rows ? ` (%${Math.round((coords / rows) * 100)})` : ''}`,
  );
  console.log(`  atlanan           ${sum((r) => r.skipped)}`);
  if (!DRY) {
    console.log(`  yeni eczane       ${sum((r) => r.imported?.pharmaciesCreated)}`);
    console.log(`  nöbet yazıldı     ${sum((r) => r.imported?.dutiesWritten)}`);
    console.log(`  korunan koordinat ${sum((r) => r.imported?.coordsPreserved)}`);
  }
  console.log(`  kaynağa istek     ${requestCount}`);
  console.log('─────────────────────────────────\n');

  const skippedRows = results.flatMap((r) => (r.skippedList ?? []).map((s) => ({ ...s, r })));
  if (skippedRows.length > 0) {
    console.warn('Atlanan kayıtlar:');
    for (const s of skippedRows) {
      console.warn(`  ${s.r.city.name} #${s.index} ${s.name} — ${s.reason}`);
    }
    console.warn('');
  }

  if (failures.length > 0) {
    console.warn(`${failures.length} il çekilemedi:`);
    for (const f of failures) console.warn(`  ${f.city.name} — ${f.message}`);
    console.warn('');
  }

  if (aborted) {
    process.stderr.write(`ÇEKİM YARIDA KESİLDİ: ${aborted}\n`);
    process.stderr.write(`Buraya kadar çekilenler yazıldı.\n\n`);
    process.exit(1);
  }

  // HİÇBİR il yazılamadıysa bu kısmi başarı DEĞİLDİR, tam başarısızlıktır ve
  // kırmızı dönmelidir. Bir kez tam tersi yaşandı: Actions koşusunda 81 ilin
  // 81'i 403 aldı, çıkış kodu 2 olduğu için iş akışı YEŞİL bitti ve prod'a hiç
  // veri yazılmadığı fark edilmedi (ADR-007).
  if (results.length === 0) {
    process.stderr.write(`HİÇBİR İL ÇEKİLEMEDİ — prod'a veri yazılmadı.\n\n`);
    process.exit(1);
  }

  // Buradan sonrası gerçekten kısmi: bir şeyler yazıldı ama eksik kaldı.
  if (failures.length > 0 || skippedRows.length > 0) process.exit(2);
} catch (e) {
  process.stderr.write(`\nHATA: ${e.message}\n\n`);
  process.exit(1);
}
