import type { Metadata } from 'next';
import { realImage } from './format';

/**
 * Shared SEO / social-share (Open Graph + Twitter) settings.
 *
 * Next.js replaces a parent's `openGraph` / `twitter` objects wholesale when a
 * page sets its own, so pages should build their metadata with `pageMeta()`
 * rather than writing `openGraph` by hand — that keeps the site name, locale,
 * fallback image and Twitter card on every page.
 */
export const SITE = {
  name: 'Shed',
  url: (process.env.BASE_URL || process.env.DOMAIN_URL || 'http://localhost:3000').replace(/\/$/, ''),
  title: 'Shed — Sell anywhere, manage everything',
  description: 'Inventory, point of sale, invoices and a free online store for your business. Shop from trusted local businesses across Nigeria.',
  locale: 'en_NG',
  twitter: process.env.TWITTER_HANDLE || undefined, // e.g. "@shedng"
  ogImage: { url: '/og-image.png', width: 1200, height: 630, alt: 'Shed — Sell anywhere. Manage everything.' },
};

type Img = string | null | undefined;

export function pageMeta(opts: {
  title?: string;
  description?: string;
  /** Path of this page, e.g. `/store/mamaput` — used as the canonical and og:url. */
  path?: string;
  /** Page-specific share images (product photo, store logo…). Placeholders are ignored; falls back to the Shed card. */
  images?: Img[];
  type?: 'website' | 'article' | 'profile';
  publishedTime?: string;
  noIndex?: boolean;
}): Metadata {
  const description = opts.description ? clip(opts.description) : SITE.description;
  const ogTitle = !opts.title ? SITE.title : /\bShed\b/.test(opts.title) ? opts.title : `${opts.title} · Shed`;
  const imgs = (opts.images || []).map((i) => realImage(i)).filter(Boolean) as string[];
  const images = imgs.length ? imgs.slice(0, 4).map((url) => ({ url, alt: opts.title || SITE.name })) : [SITE.ogImage];
  return {
    // A title that already says "Shed" skips the "· Shed" template suffix.
    ...(opts.title ? { title: /\bShed\b/.test(opts.title) ? { absolute: opts.title } : opts.title } : {}),
    description,
    ...(opts.path ? { alternates: { canonical: opts.path } } : {}),
    ...(opts.noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: opts.type || 'website',
      siteName: SITE.name,
      locale: SITE.locale,
      title: ogTitle,
      description,
      ...(opts.path ? { url: opts.path } : {}),
      images,
      ...(opts.type === 'article' && opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: images.map((i) => i.url),
      ...(SITE.twitter ? { site: SITE.twitter, creator: SITE.twitter } : {}),
    },
  };
}

function clip(s: string, n = 180) {
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
