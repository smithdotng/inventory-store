'use client';

import Link from 'next/link';
import { BrandLogo } from './Brand';
import { Suspense } from 'react';
import { useCart } from '@/lib/cart';
import { CATEGORIES } from '@/lib/categories';
import { Container } from './ui';
import { Icon } from './Icon';
import { SearchBox } from './SearchBox';
import { AccountMenu } from './AccountMenu';
import type { Viewer } from '@/lib/server/viewer';

export function Logo() {
  return (
    <BrandLogo className="h-8 sm:h-9" priority />
  );
}

export function CartButton() {
  const { count, hydrated, openDrawer } = useCart();
  return (
    <button onClick={openDrawer} aria-label={`Open cart, ${count} items`} className="relative flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-canvas">
      <Icon name="cart" size={22} />
      <span className="hidden lg:inline">Cart</span>
      {hydrated && count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-ink lg:static">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export function SiteHeader({ viewer }: { viewer: Viewer | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
      <div className="hidden bg-ink text-white sm:block">
        <Container className="flex h-9 items-center justify-between text-xs">
          <span className="text-white/75">Shop local stores · Pay the seller directly · Invoice sent to your email</span>
          <span className="flex items-center gap-5">
            <Link href="/sell" className="font-medium text-brand hover:underline">Sell on Shed</Link>
            <Link href="/clusters" className="text-white/75 hover:text-white">Markets</Link>
          </span>
        </Container>
      </div>

      <Container className="flex h-16 items-center gap-3 md:gap-6">
        <Logo />
        <Suspense fallback={<div className="hidden h-11 flex-1 rounded-xl bg-canvas md:block" />}>
          <SearchBox className="hidden flex-1 md:block" />
        </Suspense>
        <nav className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href="/search" aria-label="Search" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-canvas md:hidden">
            <Icon name="search" size={22} />
          </Link>
          <AccountMenu viewer={viewer} />
          <CartButton />
        </nav>
      </Container>

      <div className="border-t border-line">
        <Container>
          <nav aria-label="Categories" className="no-scrollbar -mx-1 flex h-11 items-center gap-1 overflow-x-auto text-sm">
            <Link href="/search" className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold hover:bg-canvas">
              <Icon name="grid" size={16} /> All
            </Link>
            {CATEGORIES.slice(0, 12).map((c) => (
              <Link key={c.name} href={`/search?category=${encodeURIComponent(c.name)}`} className="shrink-0 rounded-lg px-2.5 py-1.5 text-ink/75 hover:bg-canvas hover:text-ink">
                {c.name}
              </Link>
            ))}
          </nav>
        </Container>
      </div>
    </header>
  );
}
