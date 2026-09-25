import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { listProducts, searchStores, type ProductSort } from '@/lib/server/store';
import { CATEGORIES } from '@/lib/categories';
import { fromMarket } from '@/lib/mappers';
import { cn, realImage } from '@/lib/format';
import { Container, EmptyState } from '@/components/ui';
import { Img } from '@/components/Img';
import { Icon } from '@/components/Icon';
import { SearchBox } from '@/components/SearchBox';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
import { Pagination } from '@/components/Pagination';
import { SortSelect } from '@/components/SortSelect';

type SP = { q?: string; category?: string; type?: string; page?: string; sort?: string };
const SORTS: ProductSort[] = ['newest', 'price_asc', 'price_desc', 'name'];

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const label = searchParams.category || searchParams.q;
  return pageMeta({
    title: label ? `${label} — Shop` : 'Shop all products',
    description: label ? `Shop ${label} from trusted local stores on Shed.` : 'Browse products from trusted local stores on Shed. Pay the seller directly.',
    path: searchParams.category ? `/search?category=${encodeURIComponent(searchParams.category)}` : '/search',
  });
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const q = (searchParams.q || '').trim();
  const category = (searchParams.category || '').trim();
  const type = searchParams.type === 'stores' ? 'stores' : 'products';
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const sort: ProductSort = SORTS.includes(searchParams.sort as ProductSort) ? (searchParams.sort as ProductSort) : 'newest';

  const [products, stores] = await Promise.all([
    listProducts({ q, category, sort, page: type === 'products' ? page : 1, limit: 24 }),
    searchStores({ q, page: type === 'stores' ? page : 1, limit: 24 }),
  ]);

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { q, category, type, sort: sort === 'newest' ? '' : sort, ...patch } as SP;
    Object.entries(next).forEach(([k, v]) => v && !(k === 'type' && v === 'products') && !(k === 'page' && v === '1') && p.set(k, v));
    const s = p.toString();
    return `/search${s ? `?${s}` : ''}`;
  };

  const heading = category ? (q ? `“${q}” in ${category}` : category) : q ? `Results for “${q}”` : 'All products';

  return (
    <>
      <div className="border-b border-line bg-surface md:hidden">
        <Container className="py-3">
          <Suspense>
            <SearchBox autoFocus={!q && !category} />
          </Suspense>
        </Container>
      </div>

      <Container className="py-6 sm:py-10">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{heading}</h1>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-sm text-subtle">
            {type === 'products' ? `${products.total.toLocaleString()} products` : `${stores.total.toLocaleString()} stores`}
          </p>
          {type === 'products' && (
            <Suspense>
              <SortSelect value={sort} />
            </Suspense>
          )}
        </div>

        {/* Result type tabs */}
        {!category && (
          <div className="mt-5 flex gap-2 border-b border-line">
            {(['products', 'stores'] as const).map((t) => (
              <Link
                key={t}
                href={qs({ type: t, page: '1' })}
                className={cn('-mb-px border-b-2 px-3 pb-2.5 text-sm font-semibold capitalize', type === t ? 'border-ink text-ink' : 'border-transparent text-subtle hover:text-ink')}
              >
                {t} <span className="ml-1 font-normal text-subtle">{(t === 'products' ? products.total : stores.total).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Category chips */}
        {type === 'products' && (
          <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Link href={qs({ category: '', page: '1' })} className={cn('chip', !category && 'chip-active')}>
              All
            </Link>
            {CATEGORIES.map((c) => (
              <Link key={c.name} href={qs({ category: c.name, page: '1' })} className={cn('chip', category === c.name && 'chip-active')}>
                <Icon name={c.icon} size={15} /> {c.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6">
          {type === 'products' ? (
            products.results.length ? (
              <>
                <ProductGrid>
                  {products.results.map((p, i) => (
                    <ProductCard key={p.id} p={fromMarket(p)} showStore priority={i < 5} />
                  ))}
                </ProductGrid>
                <Pagination page={products.page} pages={products.pages} hrefFor={(n) => qs({ page: String(n) })} />
              </>
            ) : (
              <EmptyState
                icon="search"
                title="No products found"
                body={q || category ? `We couldn't find anything matching “${q || category}”. Try a different word or browse a category.` : 'No products are listed yet.'}
                action={<Link href="/categories" className="btn btn-dark">Browse categories</Link>}
              />
            )
          ) : stores.results.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stores.results.map((s) => (
                  <Link key={s.id} href={`/store/${s.username}`} className="card flex gap-4 p-4 transition hover:border-ink">
                    <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-line">
                      <Img src={realImage(s.logo)} alt={s.name} fallback="store" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block text-xs text-subtle">
                        {s.productCount} products{s.location ? ` · ${s.location}` : ''}
                      </span>
                      {s.description && <span className="mt-1 line-clamp-2 block text-sm text-ink/70">{s.description}</span>}
                    </span>
                  </Link>
                ))}
              </div>
              <Pagination page={stores.page} pages={stores.pages} hrefFor={(n) => qs({ page: String(n) })} />
            </>
          ) : (
            <EmptyState icon="store" title="No stores found" body="Try another name or search for a product instead." />
          )}
        </div>
      </Container>
    </>
  );
}
