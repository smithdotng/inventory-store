import Link from 'next/link';
import { formatCurrency } from '@/lib/format';
import { Img } from './Img';
import { QuickAdd } from './AddToCart';

export interface CardProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  image?: string;
  category?: string | null;
  storeUsername: string;
  storeName: string;
  currency: string;
}

export function ProductCard({ p, showStore = false, priority = false }: { p: CardProduct; showStore?: boolean; priority?: boolean }) {
  const href = `/store/${p.storeUsername}/products/${p.id}`;
  const soldOut = p.stock <= 0;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-lift">
      <Link href={href} className="relative block aspect-square overflow-hidden bg-canvas" aria-label={p.name}>
        <Img src={p.image} alt={p.name} loading={priority ? 'eager' : 'lazy'} className="transition-transform duration-300 group-hover:scale-[1.04]" />
        {soldOut ? (
          <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-0.5 text-[11px] font-semibold text-white">Sold out</span>
        ) : p.stock <= 5 ? (
          <span className="absolute left-2 top-2 rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold text-ink">Only {p.stock} left</span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        {showStore && (
          <Link href={`/store/${p.storeUsername}`} className="truncate text-xs font-medium text-subtle hover:text-ink">
            {p.storeName}
          </Link>
        )}
        <Link href={href} className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-ink hover:underline">
          {p.name}
        </Link>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-base font-bold sm:text-lg">{formatCurrency(p.price, p.currency)}</span>
          <QuickAdd
            item={{ id: p.id, name: p.name, cost: p.price, stock: p.stock, image: p.image, storeUsername: p.storeUsername, storeName: p.storeName, currency: p.currency }}
          />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

export function ProductRail({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5 [&>*]:w-[44%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
      {children}
    </div>
  );
}
