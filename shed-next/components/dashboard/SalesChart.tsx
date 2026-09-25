'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/format';

/** 30-day revenue bars with a hover/tap readout. */
export function SalesChart({ series, currency }: { series: { date: string; amount: number; count: number }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((d) => d.amount));
  const total = series.reduce((n, d) => n + d.amount, 0);
  const shown = hover !== null ? series[hover] : null;
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm text-subtle">{shown ? new Date(shown.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Last 30 days'}</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatCurrency(shown ? shown.amount : total, currency)}</p>
        </div>
        <p className="text-sm text-subtle">{shown ? `${shown.count} sale${shown.count === 1 ? '' : 's'}` : `${series.reduce((n, d) => n + d.count, 0)} sales`}</p>
      </div>
      <div className="flex h-40 items-end gap-[3px]" onMouseLeave={() => setHover(null)} role="img" aria-label={`Revenue over the last 30 days: ${formatCurrency(total, currency)}`}>
        {series.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${d.date}: ${formatCurrency(d.amount, currency)}`}
            className="group flex h-full flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-[3px] transition-colors ${hover === i ? 'bg-ink' : d.amount ? 'bg-brand' : 'bg-line'}`}
              style={{ height: `${Math.max(3, (d.amount / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-subtle">
        <span>{new Date(series[0]?.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
