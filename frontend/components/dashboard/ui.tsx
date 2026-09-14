import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card border p-5 shadow-card',
        accent ? 'border-primary/30 bg-primary-soft' : 'border-line bg-surface',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          {title && <h2 className="font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-16 text-center text-sm text-subtle">{children}</div>;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = (status || '').toLowerCase();
  const cls =
    s === 'paid' || s === 'completed' || s === 'active'
      ? 'bg-green-100 text-green-700'
      : s === 'pending'
        ? 'bg-amber-100 text-amber-700'
        : s === 'inactive'
          ? 'bg-gray-200 text-gray-600'
          : 'bg-muted text-ink/70';
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', cls)}>
      {status || '—'}
    </span>
  );
}
