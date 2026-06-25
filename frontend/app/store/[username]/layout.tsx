import { CartProvider } from '@/lib/cart';

export default function StoreLayout({
  params,
  children,
}: {
  params: { username: string };
  children: React.ReactNode;
}) {
  return <CartProvider storeUsername={params.username}>{children}</CartProvider>;
}
