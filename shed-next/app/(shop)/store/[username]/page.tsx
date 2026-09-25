import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ApiError, getStore } from '@/lib/server/store';
import { fromStore } from '@/lib/mappers';
import { Container, EmptyState } from '@/components/ui';
import { StoreHero } from '@/components/StoreHero';
import { StoreCatalog } from '@/components/StoreCatalog';

type P = { params: { username: string } };

async function load(username: string) {
  try {
    return await getStore(username);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: P): Promise<Metadata> {
  try {
    const { store } = await getStore(params.username);
    return pageMeta({
      title: store.businessName,
      description: store.description || `Shop ${store.businessName} online on Shed. Pay the seller directly and get your invoice by email.`,
      path: `/store/${store.username}`,
      images: [store.logo],
      type: 'profile',
    });
  } catch {
    return { title: 'Store' };
  }
}

export default async function StorePage({ params }: P) {
  const { store, products, locked } = await load(params.username);
  return (
    <>
      <StoreHero store={store} productCount={locked ? 0 : products.length} />
      <Container className="py-6 sm:py-8">
        {locked ? (
          <EmptyState icon="store" title="This store is temporarily unavailable" body="The seller isn't taking online orders right now. Please check back soon." />
        ) : (
          <StoreCatalog products={products.map(fromStore(store))} />
        )}
      </Container>
    </>
  );
}
