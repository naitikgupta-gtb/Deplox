/**
 * Per-route SEO meta tags. Vite SPAs don't change <title>/<meta> per
 * route by default, which means Google indexes every page with the same
 * title (whatever's in index.html). This hook updates document.title and
 * the standard SEO meta tags on mount so each public route has unique,
 * indexable metadata.
 *
 * Google renders JS, so meta tags injected after JS execution DO get
 * picked up — verified by Google's own docs and by every Vite/CRA
 * deploy on the internet. For sub-second discovery of new pages,
 * combine this with a sitemap.xml submitted to Google Search Console.
 *
 * Design rules (DEPLOX):
 *   - No purple, no pill buttons, no emoji icons. Use Inter font.
 *   - Title ≤ 60 chars, description ≤ 160 chars (Google's truncation
 *     limits — anything past that gets cut off in the SERP).
 */

import { useEffect } from 'react';

export interface MetaConfig {
  title: string;
  description: string;
  /** Path used for canonical and og:url. Defaults to current pathname. */
  path?: string;
  /** Optional OG image override. Defaults to /og-image.svg. */
  image?: string;
  /** Open Graph type — defaults to 'website'. Use 'article' for blog posts. */
  type?: 'website' | 'article';
  /** Noindex the page (e.g. thank-you pages, internal tools). */
  noindex?: boolean;
}

const DEFAULT_IMAGE = '/og-image.svg';
const SITE_NAME = 'DEPLOX';
const SITE_ORIGIN = 'https://deplox.site';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name'): void {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${name}"]`,
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useMeta(config: MetaConfig): void {
  useEffect(() => {
    const path = config.path ?? window.location.pathname;
    const url = `${SITE_ORIGIN}${path}`;
    const image = config.image ? `${SITE_ORIGIN}${config.image}` : `${SITE_ORIGIN}${DEFAULT_IMAGE}`;
    const fullTitle = config.title.includes(SITE_NAME)
      ? config.title
      : `${config.title} — ${SITE_NAME}`;

    document.title = fullTitle;

    // Primary SEO
    setMeta('description', config.description);

    // Robots
    setMeta('robots', config.noindex ? 'noindex, nofollow' : 'index, follow');

    // Open Graph
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', config.description, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:type', config.type ?? 'website', 'property');
    setMeta('og:image', image, 'property');
    setMeta('og:site_name', SITE_NAME, 'property');

    // Twitter
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', config.description);
    setMeta('twitter:image', image);

    // Canonical (avoid duplicate-content penalties for query strings)
    setLink('canonical', url);
  }, [config.title, config.description, config.path, config.image, config.type, config.noindex]);
}
