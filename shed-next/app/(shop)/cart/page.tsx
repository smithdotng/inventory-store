import { Container } from '@/components/ui';
import { CartPageView } from '@/components/CartPageView';

export const metadata = { title: 'Your cart', robots: { index: false } };

export default function CartPage() {
  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Your cart</h1>
      <CartPageView />
    </Container>
  );
}
