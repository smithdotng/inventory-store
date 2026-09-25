import Link from 'next/link';
import { requireSeller } from '@/lib/server/auth';
import { listOutlets } from '@/lib/server/seller/outlets';
import { formatCurrency } from '@/lib/format';
import { Flash, PageHeader } from '@/components/dashboard/ui';
import { NewOutlet } from '@/components/dashboard/OutletForms';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Outlets' };

export default async function OutletsPage({ searchParams }: { searchParams: { ok?: string } }) {
  const ctx = await requireSeller();
  const rows = await listOutlets(ctx);
  const cur = ctx.admin.currency || '₦';
  const due = rows.reduce((n: number, o: any) => n + o.commissionDue, 0);
  return (
    <>
      <PageHeader
        title="Outlets"
        subtitle={<>Give stock to kiosks, agents or branches. They sell from their own login and earn commission.{due > 0 && <> <strong className="text-brand-dark">{formatCurrency(due, cur)} commission due.</strong></>}</>}
        actions={<NewOutlet />}
      />
      <Flash ok={searchParams.ok} />
      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Icon name="store" size={32} className="mx-auto text-subtle" />
          <p className="mt-3 font-semibold">No outlets yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-subtle">Create an outlet, send it some stock, and share its login with the person running it. Their sales and commission show up here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o: any) => (
            <Link key={o._id} href={`/dashboard/outlets/${o._id}`} className="card block p-5 transition hover:border-ink">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{o.name}</p>
                  <p className="truncate text-sm text-subtle">{o.location || 'No location'} · @{o.username}</p>
                </div>
                {o.commissionDue > 0 && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">Commission due</span>}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-canvas p-2"><dt className="text-[11px] text-subtle">Units</dt><dd className="font-bold">{o.stockUnits}</dd></div>
                <div className="rounded-lg bg-canvas p-2"><dt className="text-[11px] text-subtle">Sales</dt><dd className="truncate font-bold">{formatCurrency(o.salesAmount, cur)}</dd></div>
                <div className="rounded-lg bg-canvas p-2"><dt className="text-[11px] text-subtle">Owed</dt><dd className="truncate font-bold">{formatCurrency(o.commissionDue, cur)}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
