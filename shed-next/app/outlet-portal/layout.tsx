import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentOutlet } from '@/lib/server/seller/outlets';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Outlet', template: '%s · Outlet' }, robots: { index: false } };

export default async function OutletLayout({ children }: { children: React.ReactNode }) {
  const cur = await currentOutlet();
  if (!cur) redirect('/outlet-login');
  const tabs = [['/outlet-portal', 'Stock'], ['/outlet-portal/sell', 'Sell'], ['/outlet-portal/sales', 'Sales & commission']];
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{cur.outlet.name}</p>
            <p className="truncate text-xs text-subtle">Outlet of {cur.admin?.businessName}</p>
          </div>
          <a href="/outlet-logout" className="text-sm font-medium text-subtle hover:text-ink">Sign out</a>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 text-sm font-semibold">
          {tabs.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-1.5 hover:bg-canvas">{label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
