import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dashboardUrl, requireSeller } from '@/lib/server/auth';
import { overview } from '@/lib/server/seller/sales';
import { absoluteUrl } from '@/lib/server/env';
import { formatCurrency } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Flash, PageHeader, Panel, Stat, StatusBadge, fmtDate } from '@/components/dashboard/ui';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { ShareStore } from '@/components/dashboard/ShareStore';

export const metadata = { title: 'Overview' };

export default async function OverviewPage({ searchParams }: { searchParams: { error?: string } }) {
  const ctx = await requireSeller({ anyRole: true });
  if (!['admin', 'superadmin'].includes(ctx.role)) redirect(dashboardUrl(ctx.role));
  const o = await overview(ctx);
  const cur = ctx.admin.currency || '₦';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greet}, ${ctx.displayName}`}
        subtitle="Here's how your business is doing."
        actions={
          <>
            <Link href="/dashboard/inventory?new=1" className="btn btn-outline"><Icon name="box" size={16} /> Add product</Link>
            <Link href="/dashboard/invoices/new" className="btn btn-outline"><Icon name="receipt" size={16} /> New invoice</Link>
          </>
        }
      />
      <Flash error={searchParams.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Sales today" icon="receipt" value={formatCurrency(o.today.amount, cur)} hint={`${o.today.count} sale${o.today.count === 1 ? '' : 's'}`} href="/dashboard/sales" />
        <Stat label="This month" icon="bolt" value={formatCurrency(o.month.amount, cur)} hint={`${o.month.count} sales`} tone="good" href="/dashboard/sales" />
        <Stat label="Awaiting payment" icon="info" value={formatCurrency(o.pending.amount, cur)} hint={`${o.pending.count} unpaid`} tone={o.pending.count ? 'warn' : 'default'} href="/dashboard/sales?status=pending" />
        <Stat label="Low on stock" icon="box" value={o.lowStockCount} hint={`of ${o.products} products`} tone={o.lowStockCount ? 'warn' : 'default'} href="/dashboard/inventory?filter=low" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Revenue">
          <SalesChart series={o.series} currency={cur} />
        </Panel>
        <Panel title="Your online store">
          <p className="mb-4 text-sm text-subtle">Share your store link on WhatsApp, Instagram or your status. Customers can order and you&apos;ll get notified.</p>
          <ShareStore url={absoluteUrl(`/store/${ctx.admin.username}`)} businessName={ctx.admin.businessName || ctx.admin.username} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent sales" action={<Link href="/dashboard/sales" className="text-sm font-semibold hover:underline">View all</Link>} padded={false}>
          {o.recent.length ? (
            <ul className="divide-y divide-line">
              {o.recent.map((s: any) => (
                <li key={s._id}>
                  <Link href={`/dashboard/sales/${s._id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.customerName || 'Walk-in customer'}</span>
                      <span className="block truncate text-xs text-subtle">{(s.items || []).map((i: any) => i.itemName).join(', ') || '—'} · {fmtDate(s.date, true)}</span>
                    </span>
                    <StatusBadge status={s.paymentStatus} />
                    <span className="w-28 text-right text-sm font-bold tabular-nums">{formatCurrency(s.totalAmount || 0, cur)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-subtle">
              No sales yet. <Link href="/dashboard/pos" className="font-semibold text-ink underline">Record your first sale</Link>.
            </div>
          )}
        </Panel>
        <Panel title="Restock soon" action={<Link href="/dashboard/inventory?filter=low" className="text-sm font-semibold hover:underline">Inventory</Link>} padded={false}>
          {o.lowStock.length ? (
            <ul className="divide-y divide-line">
              {o.lowStock.map((p: any) => (
                <li key={p._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.stock <= 0 ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-dark'}`}>{p.stock <= 0 ? 'Out of stock' : `${p.stock} left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-subtle">Everything is well stocked.</p>
          )}
          <div className="grid grid-cols-2 border-t border-line text-center text-sm">
            <Link href="/dashboard/customers" className="px-3 py-3 hover:bg-canvas"><strong>{o.customers}</strong> customers</Link>
            <Link href="/dashboard/messages" className="border-l border-line px-3 py-3 hover:bg-canvas"><strong>{o.unread}</strong> unread messages</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
