'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/format';
import { Icon } from './Icon';
import { InstallAppItem } from './pwa/PwaBanners';
import type { Viewer } from '@/lib/server/viewer';

const item = 'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none';
const heading = 'px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-subtle';

function Avatar({ name, className, brand }: { name: string; className?: string; brand?: boolean }) {
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase', brand ? 'bg-brand text-ink' : 'bg-ink text-white', className)} aria-hidden>
      {name.trim().slice(0, 1) || '?'}
    </span>
  );
}

/** Header account button: shows the signed-in name and a menu of the right links (shopper and/or seller). */
export function AccountMenu({ viewer }: { viewer: Viewer | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shopper = viewer?.shopper;
  const seller = viewer?.seller;
  const label = viewer ? viewer.name : 'Account';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={viewer ? `Account menu for ${viewer.name}` : 'Account menu'}
        className="flex h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold hover:bg-canvas md:px-3"
      >
        {viewer ? <Avatar name={viewer.name} className="h-7 w-7" /> : <Icon name="user" size={22} />}
        <span className="hidden max-w-[9rem] truncate lg:inline">{label}</span>
        <Icon name="chevronDown" size={14} className={cn('hidden text-subtle transition-transform md:block', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72"
        >
          {!viewer && (
            <>
              <p className={heading}>Shopping</p>
              <Link role="menuitem" href="/shopper/login" className={item}><Icon name="user" size={18} /> Sign in</Link>
              <Link role="menuitem" href="/shopper/register" className={item}><Icon name="plus" size={18} /> Create an account</Link>
              <div className="my-1 border-t border-line" />
              <p className={heading}>Selling</p>
              <Link role="menuitem" href="/admin-login" className={item}><Icon name="store" size={18} /> Seller sign in</Link>
              <Link role="menuitem" href="/sell" className={item}><Icon name="sparkle" size={18} /> Open a free store</Link>
            </>
          )}

          {shopper && (
            <>
              <div className="flex items-center gap-3 px-4 pb-2 pt-3">
                <Avatar name={shopper.name} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{shopper.name}</span>
                  <span className="block truncate text-xs text-subtle">{shopper.email}</span>
                </span>
              </div>
              <Link role="menuitem" href="/shopper/account" className={item}><Icon name="receipt" size={18} /> My orders</Link>
              <Link role="menuitem" href="/shopper/account#profile" className={item}><Icon name="gear" size={18} /> Account details</Link>
              <Link role="menuitem" href="/cart" className={item}><Icon name="cart" size={18} /> My cart</Link>
              {/* Plain <a>: a <Link> would prefetch the sign-out route. */}
              <a role="menuitem" href="/shopper/logout" className={cn(item, 'text-danger')}><Icon name="arrowRight" size={18} /> Sign out{seller ? ' of shopping' : ''}</a>
            </>
          )}

          {shopper && seller && <div className="my-1 border-t border-line" />}

          {seller && (
            <>
              <div className="flex items-center gap-3 px-4 pb-2 pt-3">
                <Avatar name={shopper ? seller.businessName : seller.name} brand />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{shopper ? seller.businessName : seller.name}</span>
                  <span className="block truncate text-xs text-subtle">{shopper ? `${seller.name} · ${seller.roleLabel}` : `${seller.businessName} · ${seller.roleLabel}`}</span>
                </span>
              </div>
              {seller.links.map((l) => (
                <Link key={l.href} role="menuitem" href={l.href} className={item}><Icon name={l.icon as any} size={18} /> {l.label}</Link>
              ))}
              <a role="menuitem" href="/admin-logout" className={cn(item, 'text-danger')}><Icon name="arrowRight" size={18} /> Sign out{shopper ? ' of your store' : ''}</a>
            </>
          )}

          <InstallAppItem className={cn(item, 'border-t border-line')} />

          {viewer && (!shopper || !seller) && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-subtle">
              {shopper ? (
                <>Selling on Shed? <Link href="/admin-login" className="font-semibold text-ink hover:underline">Seller sign in</Link></>
              ) : (
                <>Shopping too? <Link href="/shopper/login" className="font-semibold text-ink hover:underline">Shopper sign in</Link></>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Where the phone tab bar's account tab goes. */
export function accountHref(viewer: Viewer | null) {
  if (viewer?.shopper) return '/shopper/account';
  if (viewer?.seller) return viewer.seller.links[0]?.href || '/dashboard';
  return '/shopper/login';
}
