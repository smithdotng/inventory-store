import Link from 'next/link';
import { requireSeller } from '@/lib/server/auth';
import { listCustomers } from '@/lib/server/seller/catalog';
import { Flash, Money, PageHeader, fmtDate } from '@/components/dashboard/ui';
import { CustomerForm } from '@/components/dashboard/CustomerForm';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Customers' };

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string; ok?: string } }) {
  const ctx = await requireSeller();
  const rows = await listCustomers(ctx, searchParams.q || '');
  const cur = ctx.admin.currency || '₦';
  return (
    <>
      <PageHeader title="Customers" subtitle={`${rows.length} customer${rows.length === 1 ? '' : 's'}`} actions={<CustomerForm trigger="Add customer" />} />
      <Flash ok={searchParams.ok} />
      <form action="/dashboard/customers" className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
        <Icon name="search" size={18} className="text-subtle" />
        <input name="q" defaultValue={searchParams.q} placeholder="Search by name, phone or email" className="h-full w-full bg-transparent text-[15px] outline-none" />
      </form>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-subtle">No customers yet. They&apos;re added automatically when you make sales, or you can add them yourself.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c: any) => (
              <li key={c._id}>
                <Link href={`/dashboard/customers/${c._id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-canvas sm:px-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold">{(c.name || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-subtle">{[c.phone, c.email].filter((x: string) => x && x !== 'N/A').join(' · ') || 'No contact details'}</span>
                  </span>
                  <span className="hidden text-right text-xs text-subtle sm:block">{c.orders} order{c.orders === 1 ? '' : 's'}<br />{c.lastPurchase ? `Last: ${fmtDate(c.lastPurchase)}` : 'No purchases'}</span>
                  <span className="w-28 text-right text-sm font-bold"><Money value={c.totalValue || 0} currency={cur} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
