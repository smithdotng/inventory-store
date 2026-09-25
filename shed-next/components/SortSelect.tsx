'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from './Icon';

const OPTIONS = [
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['name', 'Name: A–Z'],
] as const;

/** Updates ?sort= in the URL (resets to page 1). */
export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="relative flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface pl-3 pr-8 text-sm">
      <Icon name="sort" size={16} className="text-subtle" />
      <select
        value={value}
        aria-label="Sort products"
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          if (e.target.value === 'newest') p.delete('sort');
          else p.set('sort', e.target.value);
          p.delete('page');
          const s = p.toString();
          router.push(`${pathname}${s ? `?${s}` : ''}`);
        }}
        className="h-full appearance-none bg-transparent font-medium outline-none"
      >
        {OPTIONS.map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 text-subtle" />
    </label>
  );
}
