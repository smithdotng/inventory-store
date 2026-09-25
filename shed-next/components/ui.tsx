import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import { Icon } from './Icon';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-site px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

export function SectionHeader({ title, subtitle, href, linkLabel = 'See all' }: { title: string; subtitle?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 sm:mb-6">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink hover:text-brand-dark">
          {linkLabel}
          <Icon name="chevronRight" size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'box', title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-subtle">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-subtle">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="no-scrollbar flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-sm text-subtle">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <Icon name="chevronRight" size={14} className="text-line" />}
          {it.href ? (
            <Link href={it.href} className="hover:text-ink">
              {it.label}
            </Link>
          ) : (
            <span className="max-w-[40ch] truncate text-ink">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"><Dot className="bg-danger" />Out of stock</span>;
  if (stock <= 5) return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-dark"><Dot className="bg-brand" />Only {stock} left</span>;
  return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success"><Dot className="bg-success" />In stock</span>;
}

function Dot({ className }: { className: string }) {
  return <span className={cn('h-2 w-2 rounded-full', className)} />;
}
