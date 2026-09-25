import { redirect } from 'next/navigation';
import { requireSeller } from '@/lib/server/auth';
import { billingSummary, recentCharges } from '@/lib/server/seller/billing';
import { subscribeAction } from '@/lib/actions/seller';
import { formatCurrency } from '@/lib/format';
import { Flash, PageHeader, Panel, fmtDate } from '@/components/dashboard/ui';
import { SubmitButton } from '@/components/forms';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Billing' };

const FEATURES = ['Unlimited products & sales', 'Point of sale for your whole team', 'Invoices & receipts by email and WhatsApp', 'Your own online store on the Shed marketplace', 'Outlets & commission tracking'];

export default async function BillingPage({ searchParams }: { searchParams: { error?: string; success?: string; locked?: string } }) {
  const ctx = await requireSeller({ allowLocked: true, anyRole: true });
  if (ctx.userType !== 'admin') redirect('/dashboard');
  const b = billingSummary(ctx.admin);
  const charges = await recentCharges(ctx.admin._id);
  const price = formatCurrency(b.amount, b.currency === 'NGN' ? '₦' : b.currency);
  const statusText: Record<string, string> = {
    trial: b.locked ? 'Your free trial has ended' : `Free trial — ${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left`,
    active: 'Active subscription',
    past_due: 'Payment failed — please update your card',
    expired: 'Subscription expired',
    canceled: 'Subscription cancelled',
    comped: 'Complimentary plan',
    legacy: 'Legacy plan — no payment needed',
  };
  const needsPayment = b.status === 'trial' || b.locked || ['past_due', 'expired', 'canceled'].includes(b.status);

  return (
    <>
      <PageHeader title="Billing" subtitle="Your Shed subscription." />
      {searchParams.success === '1' && <Flash ok="Payment received — your subscription is active. Thank you!" />}
      <Flash error={searchParams.error} />
      {b.locked && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-5 text-danger">
          <Icon name="lock" size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Your store is paused</p>
            <p className="text-sm">Your dashboard and online store are locked until you subscribe. Your products, customers and sales are all safe.</p>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Plan">
          <p className="text-sm text-subtle">{statusText[b.status] || b.status}</p>
          <p className="mt-2 text-4xl font-extrabold">{price}<span className="text-base font-medium text-subtle"> / month</span></p>
          <ul className="mt-5 space-y-2">
            {FEATURES.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><Icon name="check" size={16} className="text-success" /> {f}</li>)}
          </ul>
          {b.status === 'active' && b.currentPeriodEnd && <p className="mt-5 rounded-lg bg-canvas px-4 py-3 text-sm">Renews on <strong>{fmtDate(b.currentPeriodEnd)}</strong>{b.card ? ` · ${b.card.brand} •••• ${b.card.last4}` : ''}</p>}
          {needsPayment && (
            <form action={subscribeAction} className="mt-6">
              <SubmitButton className="btn-brand" pendingText="Opening secure checkout…">{b.locked ? 'Subscribe & unlock my store' : 'Subscribe now'}</SubmitButton>
              <p className="mt-2 text-center text-xs text-subtle">Secure card payment by Flutterwave. Renews monthly; your card is saved for renewals.</p>
              {!b.configured && <p className="mt-2 text-center text-xs text-danger">Online payments aren&apos;t configured on this server yet.</p>}
            </form>
          )}
        </Panel>
        <Panel title="Payment history" padded={false}>
          {charges.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-subtle">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{fmtDate(c.date)}</span>
                  <span className={c.status === 'successful' ? 'text-success' : 'text-danger'}>{c.status}</span>
                  <span className="font-semibold">{formatCurrency(c.amount, c.currency === 'NGN' ? '₦' : c.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
