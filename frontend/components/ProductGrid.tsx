import Link from 'next/link';
import type { Product, Store } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { AddToCart } from './Cart';

function ProductCard({ store, product }: { store: Store; product: Product }) {
  const image = product.images?.[0];
  const currency = store.currency || '₦';

  return (
    <div className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover">
      <Link href={`/store/${store.username}/products/${product._id}`} className="block">
        <div className="aspect-square overflow-hidden bg-muted">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-subtle">📦</div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link href={`/store/${store.username}/products/${product._id}`}>
          <h3 className="line-clamp-1 font-semibold transition-colors group-hover:text-primary-hover">
            {product.name}
          </h3>
        </Link>
        <p className="mt-1 text-lg font-bold text-ink">{formatCurrency(product.cost, currency)}</p>
        <p className="mt-1 text-xs text-subtle">{product.stock} in stock</p>
        <div className="mt-4 flex-1" />
        <AddToCart
          item={{
            id: String(product._id),
            name: product.name,
            cost: product.cost,
            stock: product.stock,
            image,
          }}
        />
      </div>
    </div>
  );
}

export function ProductGrid({ store, products }: { store: Store; products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line py-20 text-center text-subtle">
        This store has no products available right now.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={String(p._id)} store={store} product={p} />
      ))}
    </div>
  );
}
