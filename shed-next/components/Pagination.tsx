import Link from 'next/link';
import { cn } from '@/lib/format';
import { Icon } from './Icon';

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))).sort((a, b) => a - b);
  const cls = 'flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium';
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className={cn(cls, 'border-line bg-surface hover:border-ink')} aria-label="Previous page">
          <Icon name="chevronLeft" size={16} />
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-subtle">…</span>}
          <Link href={hrefFor(n)} aria-current={n === page ? 'page' : undefined} className={cn(cls, n === page ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-ink')}>
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={hrefFor(page + 1)} className={cn(cls, 'border-line bg-surface hover:border-ink')} aria-label="Next page">
          <Icon name="chevronRight" size={16} />
        </Link>
      )}
    </nav>
  );
}
