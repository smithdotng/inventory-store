'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/format';
import type { BusinessContext, SessionUser } from '@/lib/server-auth';

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: '▦' },
  { label: 'Products', href: '/dashboard/products', icon: '📦' },
  { label: 'Transactions', href: '/dashboard/transactions', icon: '💳' },
  { label: 'Invoices', href: '/dashboard/invoices', icon: '🧾' },
  { label: 'Customers', href: '/dashboard/customers', icon: '👥' },
  { label: 'Team', href: '/dashboard/team', icon: '🧑‍💼', adminOnly: true },
  { label: 'Profile', href: '/dashboard/profile', icon: '⚙️' },
];

export function DashboardShell({
  user,
  business,
  children,
}: {
  user: SessionUser;
  business: BusinessContext | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" className="text-xl font-extrabold text-surface">
          Shed<span className="text-primary">.</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-ink' : 'text-surface/70 hover:bg-surface/10 hover:text-surface',
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-surface/10 p-3">
        {business && (
          <a
            href={`/store/${business.username}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-surface/70 transition-colors hover:bg-surface/10 hover:text-surface"
          >
            <span>🌐</span> View store
          </a>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-surface/70 transition-colors hover:bg-surface/10 hover:text-surface"
        >
          <span>↩</span> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-ink lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ink">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-surface px-5 sm:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            {business?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-hover">
                {(business?.businessName || user.username).slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="leading-tight">
              <p className="text-sm font-semibold">{business?.businessName || user.username}</p>
              <p className="text-xs capitalize text-subtle">{user.role}</p>
            </div>
          </div>
        </header>

        <main className="px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
