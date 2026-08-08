import { env, SELF, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import type { components } from '@shared/api-types';
import app from '../index';

type ScrapeRun = components['schemas']['ScrapeRun'];
type ScrapeTriggerResult = components['schemas']['ScrapeTriggerResult'];
type ErrorBody = components['schemas']['Error'];

// Çekim Cloudflare'in dışında koşuyor (ADR-006). Worker'ın işi üç şey:
//   1. koşu defterini tutmak
//   2. paneli tek subrequest'lik bir dispatch ile iş akışına bağlamak
//   3. kaynağa saygı sınırını (10 dk) uygulamak

beforeAll(async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test'),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 60_000 },
    key,
    256,
  );
  const b64 = (b: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
  env.ADMIN_PASSWORD_HASH = `pbkdf2$sha256$60000$${b64(salt)}$${b64(bits)}`;
  env.ADMIN_USERNAME = 'test';
});

async function login(): Promise<string> {
  const res = await SELF.fetch('https://x/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test' }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const run = (over: Record<string, unknown> = {}) => ({
  cityCode: 7,
  dutyDate: '2026-08-08',
  startedAt: '2026-08-08T09:00:00Z',
  outcome: 'ok',
  rowsFound: 37,
  pharmaciesNew: 5,
  dutiesWritten: 37,
  coordsFetched: 5,
  rowsSkipped: 0,
  errorMessage: null,
  ...over,
});

async function postRun(cookie: string, body: Record<string, unknown>) {
  return SELF.fetch('https://x/api/admin/scrape/runs', {
    method: 'POST',
    headers: { Cookie: cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM scrape_run').run();
  await env.DB.prepare('DELETE FROM audit_log').run();
  delete env.GITHUB_REPO;
  delete env.GITHUB_DISPATCH_TOKEN;
});

describe('POST /api/admin/scrape/runs', () => {
  it('oturumsuz 401 döner', async () => {
    const res = await SELF.fetch('https://x/api/admin/scrape/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run()),
    });
    expect(res.status).toBe(401);
  });

  it('koşuyu yazar ve bitiş zamanını sunucu saatinden set eder', async () => {
    const cookie = await login();
    const res = await postRun(cookie, run());
    expect(res.status).toBe(201);

    const body = await res.json<ScrapeRun>();
    expect(body.cityCode).toBe(7);
    expect(body.cityName).toBe('Antalya');
    expect(body.rowsFound).toBe(37);
    expect(body.startedAt).toBe('2026-08-08T09:00:00Z');
    expect(body.finishedAt).not.toBeNull();
    // D1'e giren zaman MİLİSANİYESİZ olmalı — metin karşılaştırmaları buna bağlı.
    expect(body.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('milisaniyeli zaman damgasını 400 ile reddeder', async () => {
    const cookie = await login();
    const res = await postRun(cookie, run({ startedAt: '2026-08-08T09:00:00.123Z' }));
    expect(res.status).toBe(400);

    const body = await res.json<ErrorBody>();
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details?.[0]?.path).toContain('startedAt');
  });

  it('tanımsız ili 400 ile reddeder', async () => {
    const cookie = await login();
    const res = await postRun(cookie, run({ cityCode: 82 }));
    expect(res.status).toBe(400);
  });

  it('bilinmeyen outcome değerini reddeder', async () => {
    const cookie = await login();
    const res = await postRun(cookie, run({ outcome: 'belki' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/scrape/runs', () => {
  it('kayıt yokken boş dizi ve 200 döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/scrape/runs', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ items: ScrapeRun[] }>()).items).toEqual([]);
  });

  it('en yeni koşu başta döner ve il filtresi çalışır', async () => {
    const cookie = await login();
    await postRun(cookie, run({ cityCode: 7 }));
    await postRun(cookie, run({ cityCode: 1, dutyDate: '2026-08-09' }));

    const all = await SELF.fetch('https://x/api/admin/scrape/runs', {
      headers: { Cookie: cookie },
    });
    const items = (await all.json<{ items: ScrapeRun[] }>()).items;
    expect(items).toHaveLength(2);
    expect(items[0]?.cityCode).toBe(1);
    expect(items[0]?.cityName).toBe('Adana');

    const filtered = await SELF.fetch('https://x/api/admin/scrape/runs?city=7', {
      headers: { Cookie: cookie },
    });
    const only = (await filtered.json<{ items: ScrapeRun[] }>()).items;
    expect(only).toHaveLength(1);
    expect(only[0]?.cityCode).toBe(7);
  });

  it('aralık dışı limit 400 döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/scrape/runs?limit=999', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });
});

// Tetikleme uçları worker'ı DOĞRUDAN çağırır (SELF ile değil): dışa giden
// `fetch` ancak aynı isolate'te stub'lanabiliyor. Bu sürümde `cloudflare:test`
// `fetchMock` sunmuyor. Gerçek D1 yine kullanılıyor, mock DB yok.
describe('POST /api/admin/scrape/trigger', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Dışa giden isteği yakalar; ağa çıkılmaz. */
  function stubDispatch(status: number, replyBody = '') {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      return Promise.resolve(new Response(replyBody, { status }));
    });
    return calls;
  }

  async function trigger(cookie: string, body: unknown = {}) {
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request('https://x/api/admin/scrape/trigger', {
        method: 'POST',
        headers: { Cookie: cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return res;
  }

  it('yapılandırma yoksa 503 döner ve dışarı hiç çıkmaz', async () => {
    const calls = stubDispatch(204);
    const cookie = await login();
    const res = await trigger(cookie);

    expect(res.status).toBe(503);
    expect(await res.json<ErrorBody>()).toMatchObject({ error: { code: 'not_configured' } });
    expect(calls).toHaveLength(0);
  });

  it('iş akışını tetikler ve ardından 10 dakika boyunca 429 döner', async () => {
    env.GITHUB_REPO = 'kullanici/nobetci-eczane';
    env.GITHUB_DISPATCH_TOKEN = 'test-token';
    const calls = stubDispatch(204);

    const cookie = await login();
    const res = await trigger(cookie, { scope: 'tum', days: 'ikisi' });

    expect(res.status).toBe(202);
    const body = await res.json<ScrapeTriggerResult>();
    expect(body.scope).toBe('tum');
    expect(body.days).toBe('ikisi');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.github.com/repos/kullanici/nobetci-eczane/dispatches');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({
      event_type: 'scrape',
      client_payload: { scope: 'tum', days: 'ikisi' },
    });

    // Denetim kaydı sayaç görevi görüyor; ayrı tablo yok.
    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'scrape.trigger'",
    ).first<{ n: number }>();
    expect(audit?.n).toBe(1);

    // İkinci deneme kaynağa GİTMEMELİ.
    const again = await trigger(cookie);
    expect(again.status).toBe(429);
    expect(await again.json<ErrorBody>()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(calls).toHaveLength(1);
  });

  it('GitHub hata dönerse 502 verir ve ham yanıtı sızdırmaz', async () => {
    env.GITHUB_REPO = 'kullanici/nobetci-eczane';
    env.GITHUB_DISPATCH_TOKEN = 'gecersiz';
    stubDispatch(401, JSON.stringify({ message: 'Bad credentials' }));

    const cookie = await login();
    const res = await trigger(cookie);

    expect(res.status).toBe(502);
    const body = await res.json<ErrorBody>();
    expect(body.error.code).toBe('dispatch_failed');
    expect(body.error.message).not.toContain('Bad credentials');
  });

  it('geçersiz kapsam 400 ve alan yolu döner', async () => {
    const cookie = await login();
    const res = await SELF.fetch('https://x/api/admin/scrape/trigger', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'hepsi' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<ErrorBody>();
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details?.[0]?.path).toBe('scope');
  });
});
