import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Container } from '@/components/ui';
import { StoreHeader } from '@/components/StoreHeader';
import { AddToCart } from '@/components/Cart';

export async function generateMetadata({
  params,
}: {
  params: { username: string; id: string };
}): Promise<Metadata> {
  try {
    const { store, product } = await getProduct(params.username, params.id);
    return { title: `${product.name} — ${store.businessName}` };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductPage({
  params,
}: {
  params: { username: string; id: string };
}) {
  let data;
  try {
    data = await getProduct(params.username, params.id);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }
  const { store, product } = data;
  const currency = store.currency || '₦';
  const image = product.images?.[0];

  return (
    <>
      <StoreHeader store={store} />
      <Container className="py-10">
        <nav className="mb-6 text-sm text-subtle">
          <Link href={`/store/${store.username}`} className="hover:text-ink">
            {store.businessName}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="overflow-hidden rounded-card border border-line bg-muted">
            <div className="aspect-square">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl text-subtle">📦</div>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <h1 className="text-3xl font-extrabold">{product.name}</h1>
            <p className="mt-3 text-2xl font-bold text-primary-hover">
              {formatCurrency(product.cost, currency)}
            </p>
            <p className="mt-2 text-sm text-subtle">
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </p>
            {product.description && (
              <p className="mt-6 leading-relaxed text-ink/80">{product.description}</p>
            )}
            <div className="mt-8 max-w-xs">
              <AddToCart
                currency={currency}
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
        </div>
      </Container>
    </>
  );
}
