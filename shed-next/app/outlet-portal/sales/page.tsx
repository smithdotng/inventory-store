import { redirect } from 'next/navigation';
import { currentOutlet, outletActivity } from '@/lib/server/seller/outlets';
import { formatCurrency } from '@/lib/format';

export const metadata = { title: 'Sales & commission' };

export default async function Page() {
  const cur = await currentOutlet();
  if (!cur) redirect('/outlet-login');
  const c = cur.admin?.currency || '₦';
  const { sales, commissionPending, commissionPaid } = await outletActivity(cur.outlet._id);
  const customers = new Map<string, any>();
  sales.forEach((s: any) => s.customerName && s.customerName !== 'Walk-in customer' && customers.set(`${s.customerName}|${s.phoneNumber}`, s));
  return (
    <>
      <h1 className="mb-4 text-2xl font-extrabold">Sales & commission</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-subtle">Commission owed to you</p><p className="text-2xl font-extrabold">{formatCurrency(commissionPending, c)}</p></div>
        <div className="card p-4"><p className="text-sm text-subtle">Commission paid</p><p className="text-2xl font-extrabold">{formatCurrency(commissionPaid, c)}</p></div>
        <div className="card p-4"><p className="text-sm text-subtle">Customers</p><p className="text-2xl font-extrabold">{customers.size}</p></div>
      </div>
      <div className="card overflow-hidden">
        {sales.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-subtle">No sales yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sales.map((s: any) => (
              <li key={s._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{(s.items || []).map((i: any) => `${i.itemName} ×${i.quantity}`).join(', ')}</span><span className="text-xs text-subtle">{new Date(s.date).toLocaleString('en-GB')} · {s.customerName} · {s.paymentMethod}</span></span>
                <span className="text-right"><strong>{formatCurrency(s.totalAmount || 0, c)}</strong>{s.totalCommission ? <span className="block text-xs text-success">+{formatCurrency(s.totalCommission, c)} commission</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
