import Link from 'next/link';
import { requireSeller } from '@/lib/server/auth';
import { listSales } from '@/lib/server/seller/sales';
import { cn, formatCurrency } from '@/lib/format';
import { Money, PageHeader, SourceBadge, StatusBadge, fmtDate } from '@/components/dashboard/ui';
import { Pagination } from '@/components/Pagination';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Sales' };

type SP = { q?: string; from?: string; to?: string; status?: string; source?: string; page?: string };

export default async function SalesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireSeller();
  const status = searchParams.status === 'paid' || searchParams.status === 'pending' ? searchParams.status : '';
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const data = await listSales(ctx, { q: searchParams.q, from: searchParams.from, to: searchParams.to, status, source: searchParams.source, page });
  const cur = ctx.admin.currency || '₦';
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    Object.entries({ ...searchParams, ...patch }).forEach(([k, v]) => v && !(k === 'page' && v === '1') && p.set(k, String(v)));
    return `/dashboard/sales${p.size ? `?${p}` : ''}`;
  };
  const exportHref = `/dashboard/sales/export?${new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== 'page') as [string, string][])}`;

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle={<>{data.total} sales · {formatCurrency(data.amount, cur)} total{data.pendingAmount ? <> · <span className="text-brand-dark">{formatCurrency(data.pendingAmount, cur)} unpaid</span></> : null}</>}
        actions={
          <>
            <a href={exportHref} className="btn btn-outline"><Icon name="arrowRight" size={16} className="rotate-90" /> Export CSV</a>
            <Link href="/dashboard/pos" className="btn btn-dark"><Icon name="plus" size={16} strokeWidth={2.25} /> New sale</Link>
          </>
        }
      />

      <form action="/dashboard/sales" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line px-3 focus-within:border-ink">
          <Icon name="search" size={16} className="text-subtle" />
          <input name="q" defaultValue={searchParams.q} placeholder="Customer or product" className="h-full w-full bg-transparent text-sm outline-none" />
        </label>
        <input type="date" name="from" defaultValue={searchParams.from} aria-label="From date" className="input h-11 py-0 text-sm" />
        <input type="date" name="to" defaultValue={searchParams.to} aria-label="To date" className="input h-11 py-0 text-sm" />
        <select name="source" defaultValue={searchParams.source || ''} aria-label="Channel" className="input h-11 py-0 text-sm">
          <option value="">All channels</option>
          <option value="pos">Point of sale</option>
          <option value="invoice">Invoices</option>
          <option value="storefront">Online store</option>
          <option value="cart">Marketplace</option>
          <option value="outlet">Outlets</option>
        </select>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn btn-dark h-11 min-h-0">Filter</button>
      </form>

      <div className="mb-4 flex gap-2">
        {[['', 'All'], ['pending', 'Awaiting payment'], ['paid', 'Paid']].map(([k, l]) => (
          <Link key={k} href={qs({ status: k, page: '1' })} className={cn('chip', status === k && 'chip-active')}>{l}</Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {data.rows.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-subtle">No sales match these filters.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.rows.map((s: any) => (
              <li key={s._id}>
                <Link href={`/dashboard/sales/${s._id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-canvas sm:grid-cols-[1.4fr_1fr_auto_auto] sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{s.customerName || 'Walk-in customer'}</span>
                    <span className="block truncate text-xs text-subtle">{(s.items || []).map((i: any) => `${i.itemName} ×${i.quantity}`).join(', ')}</span>
                  </span>
                  <span className="order-last col-span-2 flex flex-wrap items-center gap-2 text-xs text-subtle sm:order-none sm:col-span-1">
                    {fmtDate(s.date, true)} <SourceBadge source={s.source} outlet={s.outletName} />
                  </span>
                  <span className="hidden sm:block"><StatusBadge status={s.paymentStatus} /></span>
                  <span className="text-right text-sm font-bold"><Money value={s.totalAmount || 0} currency={cur} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination page={data.page} pages={data.pages} hrefFor={(n) => qs({ page: String(n) })} />
    </>
  );
}
