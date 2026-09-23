import { useEffect } from 'react';
import type { Pharmacy } from '@app/lib/api';

type BreadcrumbItem = {
  name: string;
  url: string;
};

type SeoHeadProps = {
  title: string;
  description: string;
  canonicalUrl: string;
  pharmacies?: Pharmacy[] | undefined;
  breadcrumbs?: BreadcrumbItem[] | undefined;
};

export function SeoHead({
  title,
  description,
  canonicalUrl,
  pharmacies,
  breadcrumbs,
}: SeoHeadProps) {
  useEffect(() => {
    document.title = title;

    const setMetaTag = (selector: string, attrName: string, attrVal: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const setLinkTag = (rel: string, href: string) => {
      let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    setMetaTag('meta[name="description"]', 'name', 'description', description);
    setLinkTag('canonical', canonicalUrl);

    setMetaTag('meta[property="og:title"]', 'property', 'og:title', title);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', 'Nöbetçi Eczane');
    setMetaTag('meta[property="og:locale"]', 'property', 'og:locale', 'tr_TR');

    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    const jsonLdId = 'seo-json-ld';
    let scriptEl = document.getElementById(jsonLdId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = jsonLdId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const schemas: object[] = [];

    if (breadcrumbs && breadcrumbs.length > 0) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: b.name,
          item: b.url,
        })),
      });
    }

    if (pharmacies && pharmacies.length > 0) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: title,
        description: description,
        itemListElement: pharmacies.map((p, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          item: {
            '@type': 'Pharmacy',
            name: p.name.endsWith('Eczanesi') ? p.name : `${p.name} Eczanesi`,
            address: {
              '@type': 'PostalAddress',
              streetAddress: p.address,
              addressCountry: 'TR',
            },
            telephone: p.phone,
            ...(p.lat && p.lng
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: p.lat,
                    longitude: p.lng,
                  },
                }
              : {}),
          },
        })),
      });
    }

    scriptEl.textContent = JSON.stringify(schemas.length === 1 ? schemas[0] : schemas);
  }, [title, description, canonicalUrl, pharmacies, breadcrumbs]);

  return null;
}
