'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/format';

type Suggestion = {
  type: 'store' | 'product';
  id?: string;
  _id?: string;
  username?: string;
  businessName?: string;
  logo?: string;
  name?: string;
  price?: number;
  cost?: number;
  image?: string;
  storeUsername?: string;
  storeName?: string;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'stores', label: 'Stores' },
  { key: 'products', label: 'Products' },
] as const;

export function DiscoverSearch({
  initialQuery = '',
  initialType = 'all',
}: {
  initialQuery?: string;
  initialType?: (typeof TABS)[number]['key'];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(initialType);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(query)}&type=${tab}`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, tab]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-5 py-3 shadow-card">
        <span className="text-subtle">🔍</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stores and products…"
          className="w-full bg-transparent text-base outline-none"
        />
      </div>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-ink text-surface' : 'bg-muted text-ink/70 hover:bg-line'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {loading && <p className="py-8 text-center text-sm text-subtle">Searching…</p>}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="py-8 text-center text-sm text-subtle">No results found.</p>
        )}
        {results.map((item, idx) => {
          const isStore = item.type === 'store';
          const href = isStore
            ? `/store/${item.username}`
            : `/store/${item.storeUsername}/products/${item.id || item._id}`;
          const img = isStore ? item.logo : item.image;
          const title = isStore ? item.businessName || item.name || item.username : item.name;
          const subtitle = isStore
            ? `@${item.username}`
            : `${formatCurrency(item.price ?? item.cost ?? 0)}${item.storeName ? ` · ${item.storeName}` : ''}`;

          return (
            <Link
              key={idx}
              href={href}
              className="flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-ink"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden bg-muted text-lg text-subtle ${
                  isStore ? 'rounded-full' : 'rounded-lg'
                }`}
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={title || ''} className="h-full w-full object-cover" />
                ) : isStore ? (
                  '🏪'
                ) : (
                  '📦'
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{title}</p>
                <p className="truncate text-sm text-subtle">{subtitle}</p>
              </div>
              <span className="text-subtle">→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
