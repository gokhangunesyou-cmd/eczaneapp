/**
 * `POST /api/admin/probe` — tanı ucu (ADR-007).
 *
 * Bu uç, projede DIŞARIYA istek atan tek istek-yolu ucu. O yüzden testin ağırlığı
 * "doğru yanıtı biçimlendiriyor mu"dan çok **kapıların kapalı olduğunda**:
 * oturumsuz geçilemiyor mu, kendi origin'imize çevrilemiyor mu, şema dışı girdi
 * reddediliyor mu.
 *
 * Gerçek workerd, gerçek D1. Dışarı çıkan `fetch` testte taklit edilir — testler
 * ağa çıkmaz (ADR-004).
 */

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import type { components } from '@shared/api-types';

type ProbeResult = components['schemas']['ProbeResult'];
type ErrorBody = components['schemas']['Error'];

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

afterEach(() => {
  vi.restoreAllMocks();
});

async function login(): Promise<string> {
  const res = await SELF.fetch('https://x/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test' }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

/**
 * Dışarı çıkan `fetch`i taklit eder.
 *
 * Yanıt HAZIR NESNE olarak değil, FABRİKA olarak verilir ve mock çağrıldığı anda
 * üretilir. Sebebi workerd'ye özgü: test bağlamında kurulmuş bir `Response`un
 * gövdesi Worker'ın istek bağlamından okunamaz — "Cannot perform I/O on behalf
 * of a different request". Hazır nesne verilirse route 500 atar ve hata koda
 * aitmiş gibi görünür.
 */
const mockFetch = (make: () => Response) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(make()));

function probe(body: unknown, cookie?: string) {
  return SELF.fetch('https://x/api/admin/probe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/probe', () => {
  it('hedefin yanıtını olduğu gibi aktarır', async () => {
    const spy = mockFetch(
      () =>
        new Response('<html>merhaba</html>', {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html; charset=UTF-8' },
        }),
    );

    const cookie = await login();
    const res = await probe({ url: 'https://ornek.test/sayfa' }, cookie);

    expect(res.status).toBe(200);
    const body = await res.json<ProbeResult>();
    expect(body.status).toBe(200);
    expect(body.body).toBe('<html>merhaba</html>');
    expect(body.bodyBytes).toBe('<html>merhaba</html>'.length);
    expect(body.truncated).toBe(false);
    expect(body.headers).toContainEqual({
      name: 'content-type',
      value: 'text/html; charset=UTF-8',
    });

    // Varsayılan metot GET ve gövde gönderilmiyor.
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('hedefin 403 vermesi tanının BAŞARISIDIR, 200 döner', async () => {
    // Ucun var olma sebebi tam olarak bu: "engelleniyor muyuz" sorusunun yanıtı
    // hata değil, ölçümdür.
    mockFetch(() => new Response('Just a moment...', { status: 403, statusText: 'Forbidden' }));

    const res = await probe({ url: 'https://ornek.test/' }, await login());

    expect(res.status).toBe(200);
    expect((await res.json<ProbeResult>()).status).toBe(403);
  });

  it('POST gövdesini ve başlıkları hedefe geçirir', async () => {
    const spy = mockFetch(() => new Response('ok'));

    await probe(
      {
        url: 'https://ornek.test/api',
        method: 'POST',
        body: 'merhaba=dunya',
        headers: [{ name: 'X-Test', value: 'evet' }],
      },
      await login(),
    );

    const init = spy.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: 'POST', body: 'merhaba=dunya' });
    expect((init?.headers as Headers).get('X-Test')).toBe('evet');
  });

  it('panelin oturum çerezini hedefe SIZDIRMAZ', async () => {
    const spy = mockFetch(() => new Response('ok'));

    const cookie = await login();
    await probe({ url: 'https://ornek.test/' }, cookie);

    const sent = spy.mock.calls[0]?.[1]?.headers as Headers;
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
  });

  it('64 KB üstünü kırpar ve bunu bildirir', async () => {
    const big = 'a'.repeat(70 * 1024);
    mockFetch(() => new Response(big));

    const body = await (
      await probe({ url: 'https://ornek.test/' }, await login())
    ).json<ProbeResult>();

    expect(body.truncated).toBe(true);
    expect(body.body.length).toBe(64 * 1024);
    expect(body.bodyBytes).toBe(big.length);
  });

  it('hedefe ulaşılamazsa 502 döner, ham hata sızmaz', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:443'));

    const res = await probe({ url: 'https://ulasilamaz.test/' }, await login());

    expect(res.status).toBe(502);
    const err = await res.json<ErrorBody>();
    expect(err.error.code).toBe('source_unavailable');
    expect(err.error.message).not.toContain('ECONNREFUSED');
  });

  // ─── Kapılar ──────────────────────────────────────────────────────────────

  it('oturumsuz istek 401 döner ve dışarı ÇIKMAZ', async () => {
    // Gerileme olursa gerçek ağa çıkmasın diye yine de sahte yanıt verilir.
    const spy = mockFetch(() => new Response('buraya gelinmemeli'));

    const res = await probe({ url: 'https://ornek.test/' });

    expect(res.status).toBe(401);
    expect((await res.json<ErrorBody>()).error.code).toBe('unauthorized');
    expect(spy).not.toHaveBeenCalled();
  });

  it('kendi origin’imize çevrilemez', async () => {
    // SSRF kapısı: uç, panelin arkasındaki uçlara dolaylı erişim aracı olmamalı.
    const spy = mockFetch(() => new Response('buraya gelinmemeli'));

    const res = await probe({ url: 'https://x/api/admin/pharmacies' }, await login());

    expect(res.status).toBe(400);
    const err = await res.json<ErrorBody>();
    expect(err.error.code).toBe('bad_request');
    expect(err.error.details?.[0]?.path).toBe('url');
    expect(spy).not.toHaveBeenCalled();
  });

  it('http/https dışındaki şemaları reddeder', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://ornek.test/x', 'bu bir url değil']) {
      const res = await probe({ url }, await login());
      expect(res.status, url).toBe(400);
      expect((await res.json<ErrorBody>()).error.details?.[0]?.path).toBe('url');
    }
  });

  it('GET ile gövde gönderilmesini reddeder', async () => {
    const res = await probe(
      { url: 'https://ornek.test/', method: 'GET', body: 'x=1' },
      await login(),
    );
    expect(res.status).toBe(400);
    expect((await res.json<ErrorBody>()).error.details?.[0]?.path).toBe('body');
  });

  it('host ve content-length başlıklarını reddeder', async () => {
    const res = await probe(
      { url: 'https://ornek.test/', headers: [{ name: 'Host', value: 'baska.test' }] },
      await login(),
    );
    expect(res.status).toBe(400);
    expect((await res.json<ErrorBody>()).error.details?.[0]?.path).toBe('headers');
  });

  it('çağrıyı denetim kaydına yazar', async () => {
    mockFetch(() => new Response('ok', { status: 418 }));

    await probe({ url: 'https://ornek.test/denetim' }, await login());

    const row = await env.DB.prepare(
      `SELECT actor, detail FROM audit_log WHERE action = 'probe' ORDER BY id DESC LIMIT 1`,
    ).first<{ actor: string; detail: string }>();

    expect(row?.actor).toBe('test');
    expect(JSON.parse(row!.detail)).toMatchObject({
      url: 'https://ornek.test/denetim',
      method: 'GET',
      status: 418,
    });
  });
});
