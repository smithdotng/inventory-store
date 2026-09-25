import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn, formatCurrency } from '@/lib/format';
import { Icon } from '../Icon';

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-subtle hover:text-ink">
            <Icon name="chevronLeft" size={16} /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon, tone = 'default', href }: { label: string; value: ReactNode; hint?: ReactNode; icon: string; tone?: 'default' | 'warn' | 'good'; href?: string }) {
  const body = (
    <div className="card h-full p-5 transition hover:border-ink/40">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-subtle">{label}</p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tone === 'warn' ? 'bg-brand-soft text-brand-dark' : tone === 'good' ? 'bg-success-soft text-success' : 'bg-canvas text-ink')}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const paid = status === 'Paid' || status === 'Confirmed';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', paid ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand-dark')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', paid ? 'bg-success' : 'bg-brand')} />
      {paid ? 'Paid' : status || 'Pending'}
    </span>
  );
}

export function SourceBadge({ source, outlet }: { source?: string | null; outlet?: string | null }) {
  const label = outlet ? `Outlet · ${outlet}` : source === 'storefront' ? 'Online store' : source === 'pos' ? 'Point of sale' : source === 'invoice' ? 'Invoice' : source === 'cart' ? 'Marketplace' : 'Sale';
  return <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs font-medium text-subtle">{label}</span>;
}

export function Money({ value, currency }: { value: number; currency: string }) {
  return <span className="tabular-nums">{formatCurrency(value, currency)}</span>;
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-subtle">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Flash({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? 'alert' : 'status'} className={cn('mb-5 flex items-start gap-2 rounded-xl px-4 py-3 text-sm', error ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
      <Icon name={error ? 'info' : 'check'} size={16} className="mt-0.5 shrink-0" />
      {error || ok}
    </p>
  );
}

export const fmtDate = (d?: string | Date | null, withTime = false) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—';
