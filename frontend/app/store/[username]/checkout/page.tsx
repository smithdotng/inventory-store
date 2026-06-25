import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/api';
import { Container } from '@/components/ui';
import { StoreHeader } from '@/components/StoreHeader';
import { CheckoutForm } from '@/components/CheckoutForm';

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  try {
    const { store } = await getStore(params.username);
    return { title: `Checkout — ${store.businessName}` };
  } catch {
    return { title: 'Checkout' };
  }
}

export default async function CheckoutPage({ params }: { params: { username: string } }) {
  let data;
  try {
    data = await getStore(params.username);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  return (
    <>
      <StoreHeader store={data.store} />
      <Container className="py-10">
        <h1 className="mb-8 text-2xl font-extrabold">Checkout</h1>
        <CheckoutForm store={data.store} />
      </Container>
    </>
  );
}
