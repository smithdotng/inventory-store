import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/server/auth';
import { getSale, isPaidStatus } from '@/lib/server/seller/sales';
import { absoluteUrl } from '@/lib/server/env';
import { serialize } from '@/lib/server/db';
import { formatCurrency } from '@/lib/format';
import { Money, PageHeader, Panel, SourceBadge, StatusBadge, fmtDate } from '@/components/dashboard/ui';
import { SaleActions } from '@/components/dashboard/SaleActions';

export const metadata = { title: 'Sale' };

export default async function SalePage({ params }: { params: { id: string } }) {
  const ctx = await requireSeller();
  const raw = await getSale(ctx, params.id);
  if (!raw) notFound();
  const sale = serialize(raw);
  const cur = ctx.admin.currency || '₦';
  const ref = String(sale._id).slice(-8).toUpperCase();
  const paid = isPaidStatus(sale.paymentStatus);
  const items = sale.items?.length ? sale.items : sale.itemName ? [{ itemName: sale.itemName, quantity: sale.quantity, unitCost: sale.cost, totalCost: sale.totalAmount }] : [];

  return (
    <>
      <PageHeader
        back={{ href: sale.source === 'invoice' ? '/dashboard/invoices' : '/dashboard/sales', label: sale.source === 'invoice' ? 'Invoices' : 'Sales' }}
        title={`${paid ? 'Receipt' : 'Invoice'} #${ref}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">{fmtDate(sale.date, true)} <StatusBadge status={sale.paymentStatus} /> <SourceBadge source={sale.source} />{sale.isUpdated && <span className="text-xs text-brand-dark">Revised ×{sale.updateCount}</span>}</span>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items" padded={false}>
            <ul className="divide-y divide-line">
              {items.map((i: any, idx: number) => (
                <li key={idx} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.itemName}</span>
                    <span className="text-xs text-subtle">{i.quantity} × {formatCurrency(i.unitCost || 0, cur)}{i.vatAmount ? ` + VAT ${formatCurrency(i.vatAmount, cur)}` : ''}</span>
                  </span>
                  <Money value={i.itemTotalWithVat || i.totalCost || 0} currency={cur} />
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line px-5 py-4 text-sm">
              {sale.totalVatAmount > 0 && (
                <>
                  <div className="flex justify-between"><dt className="text-subtle">Subtotal</dt><dd><Money value={sale.subtotalAmount || 0} currency={cur} /></dd></div>
                  <div className="flex justify-between"><dt className="text-subtle">VAT</dt><dd><Money value={sale.totalVatAmount} currency={cur} /></dd></div>
                </>
              )}
              <div className="flex justify-between text-lg font-extrabold"><dt>Total</dt><dd><Money value={sale.totalAmount || 0} currency={cur} /></dd></div>
            </dl>
          </Panel>
          {sale.additionalComments && <Panel title="Notes"><p className="whitespace-pre-line text-sm">{sale.additionalComments}</p></Panel>}
        </div>
        <div className="space-y-6">
          <SaleActions
            sale={{ id: String(sale._id), paid, email: sale.email && sale.email !== 'N/A' ? sale.email : '', phone: sale.phoneNumber && sale.phoneNumber !== 'N/A' ? sale.phoneNumber : '', editable: ['invoice', 'pos'].includes(sale.source) || !sale.source, customerName: sale.customerName || '', items: items.map((i: any) => ({ itemName: i.itemName, unitCost: i.unitCost || 0, quantity: i.quantity || 1 })), paymentMethod: sale.paymentMethod || 'Cash', bankDetails: sale.bankDetails || null, additionalComments: sale.additionalComments || '' }}
            shareUrl={absoluteUrl(`/public-invoice/${sale._id}`)}
            businessName={ctx.admin.businessName}
            canManage={['admin', 'superadmin'].includes(ctx.role)}
            total={formatCurrency(sale.totalAmount || 0, cur)}
          />
          <Panel title="Customer">
            <p className="font-semibold">{sale.customerName || 'Walk-in customer'}</p>
            {sale.phoneNumber && sale.phoneNumber !== 'N/A' && <p className="text-sm text-subtle">{sale.phoneNumber}</p>}
            {sale.email && sale.email !== 'N/A' && <p className="text-sm text-subtle">{sale.email}</p>}
          </Panel>
          <Panel title="Payment">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-subtle">Method</dt><dd>{sale.paymentMethod || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-subtle">Status</dt><dd><StatusBadge status={sale.paymentStatus} /></dd></div>
              {sale.paidAt && <div className="flex justify-between"><dt className="text-subtle">Paid on</dt><dd>{fmtDate(sale.paidAt, true)}</dd></div>}
              {sale.bankDetails?.accountNumber && (
                <div className="rounded-lg bg-canvas p-3 text-xs">
                  {sale.bankDetails.bankName} · {sale.bankDetails.accountNumber}<br />{sale.bankDetails.bankAccountName}
                </div>
              )}
              {sale.createdBy?.username && <div className="flex justify-between"><dt className="text-subtle">Recorded by</dt><dd>{sale.createdBy.username}</dd></div>}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
