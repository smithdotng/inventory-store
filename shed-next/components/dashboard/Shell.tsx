'use client';

import Link from 'next/link';
import { BrandLogo } from '../Brand';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import { Icon } from '../Icon';
import { Img } from '../Img';
import { NAV, canSee } from './nav';

export interface ShellUser {
  name: string;
  role: string;
  isOwner: boolean;
  businessName: string;
  username: string;
  logo?: string | null;
  unread: number;
  trialDaysLeft: number | null;
  locked: boolean;
}

const ROLE_LABEL: Record<string, string> = { admin: 'Owner', superadmin: 'Super admin', cashier: 'Cashier', stock_clerk: 'Stock clerk' };

export function DashboardShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const active = (href: string) => (href === '/dashboard' ? path === href : href === '/dashboard/admin' ? path === href || path.startsWith('/dashboard/admin/stores') : path.startsWith(href));
  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i, user.role, user.isOwner)) })).filter((s) => s.items.length);
  const roleLabel = user.isOwner ? 'Owner' : ROLE_LABEL[user.role] || (user.role === 'admin' ? 'Manager' : user.role);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white">
          <Img src={user.logo && !/images\/logo\.png$/.test(user.logo) ? user.logo : null} alt={user.businessName} fallback="store" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{user.businessName}</span>
          <span className="block truncate text-xs text-white/50">@{user.username}</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((s) => (
          <div key={s.section} className="mb-5">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">{s.section}</p>
            {s.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', active(i.href) ? 'bg-white text-ink' : 'text-white/75 hover:bg-white/10 hover:text-white')}
              >
                <Icon name={i.icon} size={18} />
                <span className="flex-1">{i.label}</span>
                {i.href === '/dashboard/messages' && user.unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-ink">{user.unread}</span>}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <a href={`/store/${user.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">
          <Icon name="globe" size={18} /> View my online store
        </a>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-ink text-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink text-white shadow-drawer animate-fade-up">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="btn btn-ghost h-10 w-10 min-h-0 px-0 lg:hidden">
          <Icon name="menu" size={22} />
        </button>
        <div className="lg:hidden"><BrandLogo href="/dashboard" className="h-7" /></div>
        <div className="ml-auto flex items-center gap-2">
          {canSee({ href: '/dashboard/pos', label: '', icon: '', roles: ['cashier', 'stock_clerk'] }, user.role, user.isOwner) && !path.startsWith('/dashboard/pos') && (
            <Link href="/dashboard/pos" className="btn btn-brand h-10 min-h-0 px-4">
              <Icon name="plus" size={16} strokeWidth={2.25} /> <span className="hidden sm:inline">New sale</span>
            </Link>
          )}
          {['admin', 'superadmin'].includes(user.role) && (
            <Link href="/dashboard/messages" aria-label="Messages" className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-canvas">
              <Icon name="chat" size={20} />
              {user.unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand" />}
            </Link>
          )}
          <details className="group relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-canvas">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight">{user.name}</span>
                <span className="block text-xs text-subtle">{roleLabel}</span>
              </span>
              <Icon name="chevronDown" size={14} className="text-subtle" />
            </summary>
            <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
              <Link href="/dashboard/settings" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-canvas"><Icon name="gear" size={16} /> {['admin', 'superadmin'].includes(user.role) ? 'Settings' : 'Change password'}</Link>
              <a href={`/store/${user.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-canvas"><Icon name="globe" size={16} /> My online store</a>
              <Link href="/" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-canvas"><Icon name="cart" size={16} /> Shop on Shed</Link>
              <a href="/admin-logout" className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-danger hover:bg-canvas"><Icon name="arrowRight" size={16} /> Sign out</a>
            </div>
          </details>
        </div>
      </header>

      {user.trialDaysLeft !== null && user.trialDaysLeft <= 7 && !user.locked && user.isOwner && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-soft px-4 py-2 text-center text-sm text-brand-dark">
          <span>Your free trial ends in <strong>{user.trialDaysLeft} day{user.trialDaysLeft === 1 ? '' : 's'}</strong>.</span>
          <Link href="/dashboard/billing" className="font-semibold underline">Subscribe to keep selling</Link>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
