import { requireSeller } from '@/lib/server/auth';
import { customerOptions, sellableProducts } from '@/lib/server/seller/catalog';
import { PageHeader } from '@/components/dashboard/ui';
import { InvoiceBuilder } from '@/components/dashboard/InvoiceBuilder';

export const metadata = { title: 'New invoice' };

export default async function NewInvoicePage({ searchParams }: { searchParams: { customer?: string } }) {
  const ctx = await requireSeller();
  const [products, customers] = await Promise.all([sellableProducts(ctx), customerOptions(ctx)]);
  const a = ctx.admin;
  const bank = a.primaryAccount || { bankName: a.primaryBankName || '', bankAccountName: a.primaryBankAccountName || '', accountNumber: a.primaryAccountNumber || '' };
  return (
    <>
      <PageHeader back={{ href: '/dashboard/invoices', label: 'Invoices' }} title="New invoice" subtitle="Items are taken out of stock when the invoice is created." />
      <InvoiceBuilder products={products} customers={customers} currency={a.currency || '₦'} vat={a.applyVat ? Number(a.vatRate) || 0 : 0} defaultBank={bank} initialCustomer={searchParams.customer || ''} />
    </>
  );
}
