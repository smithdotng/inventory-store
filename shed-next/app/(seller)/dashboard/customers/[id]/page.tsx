import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/server/auth';
import { getCustomer } from '@/lib/server/seller/catalog';
import { Money, PageHeader, Panel, SourceBadge, StatusBadge, Stat, fmtDate } from '@/components/dashboard/ui';
import { CustomerForm } from '@/components/dashboard/CustomerForm';
import { DeleteCustomer } from '@/components/dashboard/DeleteCustomer';
import { formatCurrency } from '@/lib/format';
import { Icon, WhatsAppIcon } from '@/components/Icon';

export const metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: { id: string } }) {
  const ctx = await requireSeller();
  const data = await getCustomer(ctx, params.id);
  if (!data) notFound();
  const { customer: c, sales } = data;
  const cur = ctx.admin.currency || '₦';
  const total = sales.reduce((n: number, s: any) => n + (s.totalAmount || 0), 0);
  const unpaid = sales.filter((s: any) => !['Paid', 'Confirmed'].includes(s.paymentStatus)).reduce((n: number, s: any) => n + (s.totalAmount || 0), 0);
  const phone = c.phone && c.phone !== 'N/A' ? c.phone : '';
  const email = c.email && c.email !== 'N/A' ? c.email : '';
  return (
    <>
      <PageHeader
        back={{ href: '/dashboard/customers', label: 'Customers' }}
        title={c.name}
        subtitle={[phone, email].filter(Boolean).join(' · ') || 'No contact details'}
        actions={
          <>
            {phone && <a href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '234')}`} target="_blank" rel="noreferrer" className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]"><WhatsAppIcon size={16} /> WhatsApp</a>}
            <Link href={`/dashboard/invoices/new?customer=${c._id}`} className="btn btn-dark"><Icon name="receipt" size={16} /> New invoice</Link>
            <CustomerForm trigger="Edit" customer={c} />
          </>
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Total spent" icon="bolt" value={formatCurrency(total, cur)} />
        <Stat label="Orders" icon="receipt" value={sales.length} />
        <Stat label="Unpaid" icon="info" value={formatCurrency(unpaid, cur)} tone={unpaid ? 'warn' : 'default'} />
      </div>
      <Panel title="Purchase history" padded={false}>
        {sales.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-subtle">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sales.map((s: any) => (
              <li key={s._id}>
                <Link href={`/dashboard/sales/${s._id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{(s.items || []).map((i: any) => `${i.itemName} ×${i.quantity}`).join(', ')}</span>
                    <span className="flex items-center gap-2 text-xs text-subtle">{fmtDate(s.date, true)} <SourceBadge source={s.source} /></span>
                  </span>
                  <StatusBadge status={s.paymentStatus} />
                  <span className="w-28 text-right text-sm font-bold"><Money value={s.totalAmount || 0} currency={cur} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="mt-6 flex justify-end"><DeleteCustomer id={c._id} name={c.name} /></div>
    </>
  );
}
