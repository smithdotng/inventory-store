'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CartItem } from './types';

/**
 * One cart for the whole marketplace. Items remember which store they came
 * from; checkout happens per store (each seller fulfils their own orders).
 */
interface CartCtx {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  byStore: { storeUsername: string; storeName: string; currency: string; items: CartItem[]; subtotal: number; count: number }[];
  add: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  setQuantity: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clearStore: (storeUsername: string) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toast: { id: number; message: string; image?: string } | null;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'shed-cart:v2';

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.id && i.storeUsername) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<CartCtx['toast']>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setItems(read());
    setHydrated(true);
    // Keep tabs in sync.
    const onStorage = (e: StorageEvent) => e.key === KEY && setItems(read());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage full / blocked */
    }
  }, [items, hydrated]);

  // Signed-in shoppers: merge with the cart saved on their account, then keep it in sync.
  const [synced, setSynced] = useState<boolean | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetch('/api/cart', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.signedIn) return setSynced(false);
        setItems((local) => {
          const merged = new Map<string, CartItem>();
          [...(d.items as CartItem[]), ...local].forEach((i) => {
            const prev = merged.get(i.id);
            merged.set(i.id, prev ? { ...i, quantity: Math.min(Math.max(prev.quantity, i.quantity), i.stock || i.quantity) } : i);
          });
          return Array.from(merged.values());
        });
        setSynced(true);
      })
      .catch(() => setSynced(false));
    return () => {
      cancelled = true;
    };
  }, [hydrated]);
  useEffect(() => {
    if (!synced) return;
    const t = setTimeout(() => {
      fetch('/api/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map((i) => ({ id: i.id, quantity: i.quantity })) }) }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [items, synced]);

  const clamp = (qty: number, stock: number) => Math.max(1, stock > 0 ? Math.min(qty, stock) : qty);

  const showToast = useCallback((message: string, image?: string) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, image });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const add = useCallback<CartCtx['add']>(
    (item, qty = 1) => {
      setItems((prev) => {
        const found = prev.find((i) => i.id === item.id);
        if (found) return prev.map((i) => (i.id === item.id ? { ...i, ...item, quantity: clamp(i.quantity + qty, item.stock) } : i));
        return [...prev, { ...item, quantity: clamp(qty, item.stock) }];
      });
      showToast(`${item.name} added to cart`, item.image);
    },
    [showToast],
  );

  const value = useMemo<CartCtx>(() => {
    const groups = new Map<string, CartCtx['byStore'][number]>();
    for (const i of items) {
      const g = groups.get(i.storeUsername) || { storeUsername: i.storeUsername, storeName: i.storeName, currency: i.currency, items: [], subtotal: 0, count: 0 };
      g.items.push(i);
      g.subtotal += i.cost * i.quantity;
      g.count += i.quantity;
      groups.set(i.storeUsername, g);
    }
    return {
      items,
      hydrated,
      count: items.reduce((n, i) => n + i.quantity, 0),
      byStore: Array.from(groups.values()),
      add,
      setQuantity: (id, qty) => setItems((p) => p.map((i) => (i.id === id ? { ...i, quantity: clamp(qty, i.stock) } : i))),
      remove: (id) => setItems((p) => p.filter((i) => i.id !== id)),
      clearStore: (u) => setItems((p) => p.filter((i) => i.storeUsername.toLowerCase() !== u.toLowerCase())),
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      toast,
    };
  }, [items, hydrated, add, drawerOpen, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

/** Items for one store (case-insensitive username match). */
export function useStoreCart(username: string) {
  const { byStore } = useCart();
  return byStore.find((g) => g.storeUsername.toLowerCase() === username.toLowerCase());
}
