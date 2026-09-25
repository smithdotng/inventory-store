import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, getStore } from '@/lib/server/store';
import { Breadcrumbs, Container, EmptyState } from '@/components/ui';
import { CheckoutForm } from '@/components/CheckoutForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage({ params }: { params: { username: string } }) {
  let data;
  try {
    data = await getStore(params.username);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { store, products, locked } = data;
  // Live stock so the form can warn about items that sold out since they were added.
  const stock = Object.fromEntries(products.map((p) => [String(p._id), p.stock]));

  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={[{ label: store.businessName, href: `/store/${store.username}` }, { label: 'Checkout' }]} />
      <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-subtle">
        Ordering from <strong className="text-ink">{store.businessName}</strong>
      </p>
      <div className="mt-6">
        {locked ? (
          <EmptyState icon="store" title="This store is temporarily unavailable" body="The seller isn't taking online orders right now. Your cart has been kept." />
        ) : (
          <CheckoutForm store={store} liveStock={stock} />
        )}
      </div>
    </Container>
  );
}
