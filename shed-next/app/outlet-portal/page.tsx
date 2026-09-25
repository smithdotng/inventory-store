import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentOutlet } from '@/lib/server/seller/outlets';
import { formatCurrency } from '@/lib/format';

export default async function OutletStock() {
  const cur = await currentOutlet();
  if (!cur) redirect('/outlet-login');
  const c = cur.admin?.currency || '₦';
  const items = (cur.outlet.inventory || []) as any[];
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Your stock</h1>
        <Link href="/outlet-portal/sell" className="btn btn-brand">New sale</Link>
      </div>
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-subtle">No stock yet. Your store owner sends stock to this outlet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={String(i.id)} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="min-w-0"><span className="block truncate font-medium">{i.name}</span><span className="text-sm text-subtle">{formatCurrency(i.cost || 0, c)}</span></span>
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${i.stock <= 0 ? 'bg-danger-soft text-danger' : i.stock <= 5 ? 'bg-brand-soft text-brand-dark' : 'bg-success-soft text-success'}`}>{i.stock} left</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
