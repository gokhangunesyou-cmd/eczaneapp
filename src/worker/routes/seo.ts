import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { slugify } from '@shared/slug';

export const seoRoutes = new Hono<AppEnv>();

seoRoutes.get('/robots.txt', (c) => {
  const content = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: https://nobetcieczane.becayisler.com/sitemap.xml
`;
  return c.text(content, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  });
});

seoRoutes.get('/sitemap.xml', async (c) => {
  const db = c.env.DB;
  const baseUrl = 'https://nobetcieczane.becayisler.com';

  const [citiesResult, districtsResult, pharmaciesResult] = await Promise.all([
    db
      .prepare('SELECT code, name, slug FROM city')
      .all<{ code: number; name: string; slug: string }>(),
    db
      .prepare(
        `SELECT d.code, d.name, d.slug AS district_slug, c.slug AS city_slug
         FROM district d
         JOIN city c ON c.code = d.city_code`,
      )
      .all<{ code: string; name: string; district_slug: string; city_slug: string }>(),
    db
      .prepare(
        `SELECT p.name, p.slug, d.slug AS district_slug, c.slug AS city_slug
         FROM pharmacy p
         JOIN district d ON d.code = p.district_code
         JOIN city c ON c.code = d.city_code
         LIMIT 1000`,
      )
      .all<{ name: string; slug: string; district_slug: string; city_slug: string }>(),
  ]);

  const today = new Date().toISOString().split('T')[0];

  const urls: { loc: string; priority: string; changefreq: string }[] = [
    { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' },
  ];

  for (const city of citiesResult.results) {
    const cSlug = city.slug || slugify(city.name);
    urls.push({
      loc: `${baseUrl}/${cSlug}-nobetci-eczane`,
      priority: '0.8',
      changefreq: 'daily',
    });
  }

  for (const d of districtsResult.results) {
    const cSlug = d.city_slug || 'antalya';
    const dSlug = d.district_slug || slugify(d.name);
    urls.push({
      loc: `${baseUrl}/${cSlug}-${dSlug}-nobetci-eczane`,
      priority: '0.9',
      changefreq: 'daily',
    });
  }

  for (const p of pharmaciesResult.results) {
    const cSlug = p.city_slug || 'antalya';
    const dSlug = p.district_slug || 'merkez';
    const pKey = slugify(p.name).replace(/-eczane(si)?$/, '');
    urls.push({
      loc: `${baseUrl}/${cSlug}-${dSlug}-${pKey}-eczanesi`,
      priority: '0.7',
      changefreq: 'daily',
    });
  }

  const xmlEntries = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;

  return c.text(xml, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  });
});
