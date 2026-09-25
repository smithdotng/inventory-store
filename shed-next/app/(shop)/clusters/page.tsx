import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { listClusters } from '@/lib/server/public/content';
import { Container, EmptyState } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = pageMeta({ title: 'Markets', description: 'Shop by market — browse verified stores from popular markets and plazas.', path: '/clusters' });
export const dynamic = 'force-dynamic';

export default async function ClustersPage() {
  const clusters = await listClusters();
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Shop by market</h1>
      <p className="mt-2 text-subtle">Browse verified stores from the markets and plazas you already know.</p>
      {clusters.length === 0 ? (
        <div className="mt-8"><EmptyState icon="store" title="No markets yet" /></div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((c: any) => (
            <Link key={c._id} href={`/cluster/${c.slug}`} className="card group flex items-start gap-4 p-5 transition hover:border-ink">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-canvas group-hover:bg-brand"><Icon name="store" size={22} /></span>
              <span className="min-w-0">
                <span className="block font-bold">{c.name}</span>
                <span className="block text-sm text-subtle">{c.storeCount} verified store{c.storeCount === 1 ? '' : 's'}{c.city ? ` · ${c.city}` : ''}</span>
                {c.description && <span className="mt-1 line-clamp-2 block text-sm text-ink/70">{c.description}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
