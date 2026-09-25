'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/format';
import { Icon } from './Icon';
import { accountHref } from './AccountMenu';
import type { Viewer } from '@/lib/server/viewer';

/** Thumb-reachable navigation on phones. Hidden where a page has its own sticky action bar. */
export function MobileTabBar({ viewer }: { viewer: Viewer | null }) {
  const path = usePathname();
  const { count, hydrated, openDrawer } = useCart();
  if (/\/products\/|\/checkout$/.test(path)) return null;

  const tab = (active: boolean) => cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-ink' : 'text-subtle');

  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <div className="flex h-16">
        <Link href="/" className={tab(path === '/')}>
          <Icon name="home" size={22} /> Home
        </Link>
        <Link href="/search" className={tab(path.startsWith('/search'))}>
          <Icon name="search" size={22} /> Search
        </Link>
        <Link href="/categories" className={tab(path.startsWith('/categories'))}>
          <Icon name="grid" size={22} /> Categories
        </Link>
        <button onClick={openDrawer} className={cn(tab(false), 'relative')}>
          <span className="relative">
            <Icon name="cart" size={22} />
            {hydrated && count > 0 && (
              <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-ink">{count}</span>
            )}
          </span>
          Cart
        </button>
        <Link href={accountHref(viewer)} className={tab(path.startsWith('/shopper'))}>
          {viewer ? (
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink text-[10px] font-bold uppercase text-white">{viewer.name.slice(0, 1)}</span>
          ) : (
            <Icon name="user" size={22} />
          )}
          <span className="max-w-[4.5rem] truncate">{viewer ? viewer.name : 'Account'}</span>
        </Link>
      </div>
    </nav>
  );
}
