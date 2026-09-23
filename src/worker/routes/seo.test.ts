import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('SEO endpoints', () => {
  it('GET /robots.txt sitemap yönlendirmesi ve tarayıcı kurallarını döner', async () => {
    const res = await SELF.fetch('https://x/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const text = await res.text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Allow: /');
    expect(text).toContain('Disallow: /admin');
    expect(text).toContain('Sitemap: https://nobetcieczane.becayisler.com/sitemap.xml');
  });

  it('GET /sitemap.xml dinamik XML sitemap içerir', async () => {
    const res = await SELF.fetch('https://x/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');

    const xml = await res.text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('https://nobetcieczane.becayisler.com/');
  });
});
