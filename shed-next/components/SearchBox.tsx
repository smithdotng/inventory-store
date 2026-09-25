'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { cn, formatCurrency, realImage } from '@/lib/format';
import { Icon } from './Icon';
import { Img } from './Img';

type Suggestion = {
  type: 'store' | 'product';
  id: string;
  name?: string;
  username?: string;
  logo?: string;
  price?: number;
  currency?: string;
  image?: string;
  storeName?: string;
  storeUsername?: string;
};

/** Marketplace search with live suggestions (stores + products). */
export function SearchBox({ className, autoFocus = false, size = 'md' }: { className?: string; autoFocus?: boolean; size?: 'md' | 'lg' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => setQ(params.get('q') || ''), [params]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setItems([]);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(term)}&type=all`, { signal: ctrl.signal });
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
        setActive(-1);
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const hrefFor = (s: Suggestion) => (s.type === 'store' ? `/store/${s.username}` : `/store/${s.storeUsername}/products/${s.id}`);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && items[active]) return go(hrefFor(items[active]));
    const term = q.trim();
    go(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Escape') setOpen(false);
  };

  const showList = open && q.trim().length >= 2 && items.length > 0;

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <form onSubmit={submit} role="search">
        <label className={cn('flex items-center gap-2 rounded-xl border border-line bg-canvas pl-4 pr-1.5 transition focus-within:border-ink focus-within:bg-surface', size === 'lg' ? 'h-14' : 'h-11')}>
          <Icon name="search" size={18} className="shrink-0 text-subtle" />
          <input
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder="Search products, stores…"
            aria-label="Search the marketplace"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={showList}
            role="combobox"
            enterKeyHint="search"
            className="h-full w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-subtle"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="p-1.5 text-subtle hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          )}
          <button type="submit" className={cn('btn btn-dark min-h-0 shrink-0 rounded-lg px-4', size === 'lg' ? 'h-11' : 'h-8 text-[13px]')}>
            Search
          </button>
        </label>
      </form>

      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
          {items.map((s, i) => (
            <li key={`${s.type}-${s.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hrefFor(s))}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === active && 'bg-canvas')}
              >
                <span className={cn('h-10 w-10 shrink-0 overflow-hidden border border-line', s.type === 'store' ? 'rounded-full' : 'rounded-lg')}>
                  <Img src={realImage(s.type === 'store' ? s.logo : s.image)} alt={s.name || ''} fallback={s.type === 'store' ? 'store' : 'product'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-subtle">
                    {s.type === 'store' ? 'Store' : `${formatCurrency(s.price || 0, s.currency)}${s.storeName ? ` · ${s.storeName}` : ''}`}
                  </span>
                </span>
                <Icon name={s.type === 'store' ? 'store' : 'chevronRight'} size={16} className="text-subtle" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-sm font-semibold hover:bg-canvas">
              <Icon name="search" size={16} /> See all results for “{q.trim()}”
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
