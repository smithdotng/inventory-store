import { CartProvider } from '@/lib/cart';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CartDrawer, CartToast } from '@/components/CartDrawer';
import { MobileTabBar } from '@/components/MobileTabBar';
import { getViewer } from '@/lib/server/viewer';

/** Marketplace shell: header with search + cart, footer, mobile tab bar. */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  // Who is signed in (shopper and/or seller) — drives the header account menu.
  const viewer = await getViewer().catch(() => null);
  return (
    <CartProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <SiteHeader viewer={viewer} />
      <main id="main" className="pb-20 md:pb-0">{children}</main>
      <SiteFooter />
      <MobileTabBar viewer={viewer} />
      <CartDrawer />
      <CartToast />
    </CartProvider>
  );
}
