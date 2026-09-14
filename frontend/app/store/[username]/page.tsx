import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/api';
import { Container } from '@/components/ui';
import { StoreHeader } from '@/components/StoreHeader';
import { ProductGrid } from '@/components/ProductGrid';

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  try {
    const { store } = await getStore(params.username);
    return {
      title: `${store.businessName} — Online Store`,
      description: store.description || `Shop ${store.businessName} online.`,
    };
  } catch {
    return { title: 'Store' };
  }
}

export default async function StorePage({ params }: { params: { username: string } }) {
  let data;
  try {
    data = await getStore(params.username);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }
  const { store, products } = data;

  return (
    <>
      <StoreHeader store={store} />
      <Container className="py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Products</h2>
          <span className="text-sm text-subtle">{products.length} items</span>
        </div>
        <ProductGrid store={store} products={products} />
      </Container>
    </>
  );
}
