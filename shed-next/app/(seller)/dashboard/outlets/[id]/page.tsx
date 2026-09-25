import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/server/auth';
import { getOutlet } from '@/lib/server/seller/outlets';
import { sellableProducts } from '@/lib/server/seller/catalog';
import { absoluteUrl } from '@/lib/server/env';
import { formatCurrency } from '@/lib/format';
import { Money, PageHeader, Panel, fmtDate } from '@/components/dashboard/ui';
import { DispenseForm, EditOutlet, PayCommission } from '@/components/dashboard/OutletForms';

export const metadata = { title: 'Outlet' };

export default async function OutletPage({ params }: { params: { id: string } }) {
  const ctx = await requireSeller();
  const [data, products] = await Promise.all([getOutlet(ctx, params.id), sellableProducts(ctx)]);
  if (!data) notFound();
  const { outlet, sales, commissions, payments, commissionDue } = data;
  const cur = ctx.admin.currency || '₦';
  const stock = (outlet.inventory || []).filter((i: any) => i.stock > 0);
  return (
    <>
      <PageHeader
        back={{ href: '/dashboard/outlets', label: 'Outlets' }}
        title={outlet.name}
        subtitle={<>{outlet.location || 'No location'} · Login <strong className="text-ink">@{outlet.username}</strong> at <a href="/outlet-login" className="underline">{absoluteUrl('/outlet-login').replace(/^https?:\/\//, '')}</a></>}
        actions={<><a href={`/outlet/${outlet.username}`} target="_blank" rel="noreferrer" className="btn btn-outline">Public page</a><EditOutlet outlet={outlet} /></>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title={`Stock at this outlet (${stock.reduce((n: number, i: any) => n + i.stock, 0)} units)`} padded={false}>
            {stock.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-subtle">No stock here yet. Send some from your inventory.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stock.map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="truncate">{i.name}</span>
                    <span className="flex items-center gap-4"><span className="text-subtle">{formatCurrency(i.cost || 0, cur)}</span><strong className="w-12 text-right">{i.stock}</strong></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Recent outlet sales" padded={false}>
            {sales.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-subtle">No sales yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {sales.map((s: any) => (
                  <li key={s._id}>
                    <Link href={`/dashboard/sales/${s._id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-canvas">
                      <span className="min-w-0"><span className="block truncate font-medium">{(s.items || []).map((i: any) => `${i.itemName} ×${i.quantity}`).join(', ')}</span><span className="text-xs text-subtle">{fmtDate(s.date, true)} · {s.customerName}</span></span>
                      <span className="text-right"><Money value={s.totalAmount || 0} currency={cur} />{s.totalCommission ? <span className="block text-xs text-subtle">commission {formatCurrency(s.totalCommission, cur)}</span> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Move stock"><DispenseForm outletId={String(outlet._id)} products={products} currency={cur} /></Panel>
          <Panel title="Commission">
            <p className="text-3xl font-extrabold">{formatCurrency(commissionDue, cur)}</p>
            <p className="mb-4 text-sm text-subtle">owed from {commissions.length} sale item{commissions.length === 1 ? '' : 's'}. Set commission % per product in Inventory.</p>
            <PayCommission outletId={String(outlet._id)} amount={commissionDue} currency={cur} />
            {payments.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                {payments.map((p: any) => <li key={p._id} className="flex justify-between"><span className="text-subtle">{fmtDate(p.datePaid)}</span><span className="font-semibold">{formatCurrency(p.amount, cur)}</span></li>)}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
