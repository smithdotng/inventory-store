import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/server/db';
import { storeOpenFilter } from '@/lib/server/subscription';
import { SITE } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/** Public pages + every open store, market and published blog post. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const u = (p: string) => `${SITE.url}${p}`;
  const fixed: MetadataRoute.Sitemap = ['/', '/search', '/categories', '/clusters', '/blog', '/sell', '/contact'].map((p) => ({ url: u(p), changeFrequency: 'daily', priority: p === '/' ? 1 : 0.7 }));
  try {
    const db = await getDb();
    const [stores, posts, clusters] = await Promise.all([
      db.collection('admins').find({ role: { $ne: 'superadmin' }, active: { $ne: false }, ...storeOpenFilter('') }).project({ username: 1, updatedAt: 1, createdAt: 1 }).limit(5000).toArray(),
      db.collection('blog_posts').find({ published: true }).project({ slug: 1, updatedAt: 1, createdAt: 1 }).limit(1000).toArray(),
      db.collection('market_clusters').find({ active: { $ne: false } }).project({ slug: 1 }).limit(500).toArray(),
    ]);
    return [
      ...fixed,
      ...stores.filter((s) => s.username).map((s) => ({ url: u(`/store/${encodeURIComponent(s.username)}`), lastModified: s.updatedAt || s.createdAt, changeFrequency: 'daily' as const, priority: 0.8 })),
      ...clusters.filter((c) => c.slug).map((c) => ({ url: u(`/cluster/${c.slug}`), changeFrequency: 'weekly' as const, priority: 0.6 })),
      ...posts.filter((p) => p.slug).map((p) => ({ url: u(`/blog/${p.slug}`), lastModified: p.updatedAt || p.createdAt, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ];
  } catch {
    return fixed;
  }
}
