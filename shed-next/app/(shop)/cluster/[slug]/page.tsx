import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { getCluster } from '@/lib/server/public/content';
import { Container, EmptyState } from '@/components/ui';
import { Img } from '@/components/Img';
import { Icon } from '@/components/Icon';
import { Pagination } from '@/components/Pagination';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
import { realImage } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const d = await getCluster(params.slug);
  if (!d) return { title: 'Market' };
  const c: any = d.cluster;
  return pageMeta({ title: `${c.name} market`, description: c.description || `Shop verified stores from ${c.name}${c.city ? `, ${c.city}` : ''} on Shed.`, path: `/cluster/${params.slug}`, images: [c.image, c.coverImage] });
}

export default async function ClusterPage({ params, searchParams }: { params: { slug: string }; searchParams: { q?: string; page?: string } }) {
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const d = await getCluster(params.slug, searchParams.q || '', page);
  if (!d) notFound();
  const href = (p: number) => `/cluster/${params.slug}?${new URLSearchParams({ ...(searchParams.q ? { q: searchParams.q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return (
    <Container className="py-8 sm:py-12">
      <Link href="/clusters" className="text-sm font-medium text-subtle hover:text-ink">← All markets</Link>
      <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{d.cluster.name}</h1>
      {d.cluster.description && <p className="mt-2 max-w-2xl text-subtle">{d.cluster.description}</p>}

      {d.stores.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-6 flex gap-3 overflow-x-auto px-4">
          {d.stores.map((s: any) => (
            <Link key={s._id} href={`/store/${s.username}`} className="card flex w-60 shrink-0 items-center gap-3 p-3 hover:border-ink">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-line"><Img src={realImage(s.logo)} alt={s.businessName || s.username} fallback="store" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.businessName || s.username}</span><span className="block truncate text-xs text-subtle">{s.category || 'Store'}</span></span>
            </Link>
          ))}
        </div>
      )}

      <form action={`/cluster/${params.slug}`} className="mt-6 flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-ink sm:max-w-md">
        <Icon name="search" size={18} className="text-subtle" />
        <input name="q" defaultValue={searchParams.q} placeholder={`Search ${d.cluster.name}`} className="h-full w-full bg-transparent outline-none" />
      </form>

      <div className="mt-6">
        {d.products.length === 0 ? (
          <EmptyState title="No products found" body={d.stores.length ? 'Try another search.' : 'Stores in this market will appear once verified.'} />
        ) : (
          <ProductGrid>
            {d.products.map((p: any) => (
              <ProductCard key={p.id} showStore p={{ id: p.id, name: p.name, price: p.price, stock: p.stock, image: realImage(p.image), storeUsername: p.storeUsername, storeName: p.storeName, currency: p.currency }} />
            ))}
          </ProductGrid>
        )}
      </div>
      <Pagination page={d.page} pages={d.pages} hrefFor={href} />
    </Container>
  );
}
