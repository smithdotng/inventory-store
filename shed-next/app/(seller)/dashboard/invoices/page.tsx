import Link from 'next/link';
import { requireSeller } from '@/lib/server/auth';
import { listSales } from '@/lib/server/seller/sales';
import { cn, formatCurrency } from '@/lib/format';
import { Money, PageHeader, StatusBadge, fmtDate } from '@/components/dashboard/ui';
import { Pagination } from '@/components/Pagination';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Invoices' };

export default async function InvoicesPage({ searchParams }: { searchParams: { status?: string; q?: string; page?: string } }) {
  const ctx = await requireSeller();
  const status = searchParams.status === 'paid' || searchParams.status === 'pending' ? searchParams.status : '';
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const data = await listSales(ctx, { source: 'invoice', status, q: searchParams.q, page });
  const cur = ctx.admin.currency || '₦';
  const link = (s: string, p = 1) => {
    const q = new URLSearchParams();
    if (s) q.set('status', s);
    if (searchParams.q) q.set('q', searchParams.q);
    if (p > 1) q.set('page', String(p));
    return `/dashboard/invoices${q.size ? `?${q}` : ''}`;
  };
  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={<>Bill customers and track what&apos;s been paid.{data.pendingAmount ? <> <span className="font-semibold text-brand-dark">{formatCurrency(data.pendingAmount, cur)} outstanding.</span></> : null}</>}
        actions={<Link href="/dashboard/invoices/new" className="btn btn-dark"><Icon name="plus" size={16} strokeWidth={2.25} /> New invoice</Link>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          {[['', 'All'], ['pending', 'Unpaid'], ['paid', 'Paid']].map(([k, l]) => (
            <Link key={k} href={link(k)} className={cn('chip', status === k && 'chip-active')}>{l}</Link>
          ))}
        </div>
        <form action="/dashboard/invoices" className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 sm:max-w-xs sm:ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <Icon name="search" size={16} className="text-subtle" />
          <input name="q" defaultValue={searchParams.q} placeholder="Search customer" className="h-full w-full bg-transparent text-sm outline-none" />
        </form>
      </div>
      <div className="card overflow-hidden">
        {data.rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Icon name="receipt" size={32} className="mx-auto text-subtle" />
            <p className="mt-3 font-semibold">No invoices yet</p>
            <p className="mt-1 text-sm text-subtle">Create a professional invoice in under a minute and send it by email or WhatsApp.</p>
            <Link href="/dashboard/invoices/new" className="btn btn-dark mt-5">Create invoice</Link>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.rows.map((s: any) => (
              <li key={s._id}>
                <Link href={`/dashboard/sales/${s._id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-canvas sm:px-5">
                  <span className="hidden w-24 shrink-0 font-mono text-xs text-subtle sm:block">INV-{String(s._id).slice(-8).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.customerName}</span>
                    <span className="block text-xs text-subtle">{fmtDate(s.date)} · {s.paymentMethod}</span>
                  </span>
                  <StatusBadge status={s.paymentStatus} />
                  <span className="w-28 text-right text-sm font-bold"><Money value={s.totalAmount || 0} currency={cur} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination page={data.page} pages={data.pages} hrefFor={(n) => link(status, n)} />
    </>
  );
}
