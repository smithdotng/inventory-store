'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/format';
import { Icon } from './Icon';
import { EmptyState } from './ui';
import { ProductCard, ProductGrid, type CardProduct } from './ProductCard';

const SORTS = {
  featured: { label: 'Featured', fn: () => 0 },
  priceAsc: { label: 'Price: low to high', fn: (a: CardProduct, b: CardProduct) => a.price - b.price },
  priceDesc: { label: 'Price: high to low', fn: (a: CardProduct, b: CardProduct) => b.price - a.price },
  name: { label: 'Name: A–Z', fn: (a: CardProduct, b: CardProduct) => a.name.localeCompare(b.name) },
} as const;
type SortKey = keyof typeof SORTS;

/** In-store browsing: filter by text + category, sort. All client-side (store catalogs are small). */
export function StoreCatalog({ products }: { products: CardProduct[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('featured');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => p.category && counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [products]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = products.filter((p) => (!cat || p.category === cat) && (!term || p.name.toLowerCase().includes(term)));
    return sort === 'featured' ? list : [...list].sort(SORTS[sort].fn);
  }, [products, q, cat, sort]);

  if (products.length === 0) {
    return <EmptyState title="No products yet" body="This store hasn't listed any items. Check back soon or message the seller." />;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-11 items-center sm:flex-1 gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
          <Icon name="search" size={18} className="text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this store" aria-label="Search this store" className="h-full w-full bg-transparent text-[15px] outline-none" />
        </label>
        <label className="relative flex h-11 items-center gap-2 rounded-xl border border-line bg-surface pl-3 pr-8 text-sm sm:w-56">
          <Icon name="sort" size={16} className="text-subtle" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort products" className="h-full w-full appearance-none bg-transparent font-medium outline-none">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 text-subtle" />
        </label>
      </div>

      {categories.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button onClick={() => setCat('')} className={cn('chip', !cat && 'chip-active')}>
            All <span className="opacity-60">{products.length}</span>
          </button>
          {categories.map(([name, n]) => (
            <button key={name} onClick={() => setCat(name === cat ? '' : name)} className={cn('chip', cat === name && 'chip-active')}>
              {name} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      <p className="mb-4 mt-5 text-sm text-subtle">{shown.length === products.length ? `${products.length} products` : `Showing ${shown.length} of ${products.length}`}</p>

      {shown.length ? (
        <ProductGrid>
          {shown.map((p, i) => (
            <ProductCard key={p.id} p={p} priority={i < 5} />
          ))}
        </ProductGrid>
      ) : (
        <EmptyState
          icon="search"
          title="No matches"
          body="Try a different search or clear the filters."
          action={<button onClick={() => { setQ(''); setCat(''); }} className="btn btn-dark">Clear filters</button>}
        />
      )}
    </div>
  );
}
