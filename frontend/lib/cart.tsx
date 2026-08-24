'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem } from './types';

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  add: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  setQuantity: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(storeUsername: string) {
  return `shed-cart:${storeUsername}`;
}

export function CartProvider({ storeUsername, children }: { storeUsername: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted cart on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(storeUsername));
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, [storeUsername]);

  // Persist on change.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKey(storeUsername), JSON.stringify(items));
  }, [items, hydrated, storeUsername]);

  const value = useMemo<CartContextValue>(() => {
    const clampQty = (item: CartItem, qty: number) =>
      Math.max(1, Math.min(qty, item.stock || qty));

    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      total: items.reduce((n, i) => n + i.cost * i.quantity, 0),
      add: (item, qty = 1) =>
        setItems((prev) => {
          const existing = prev.find((i) => i.id === item.id);
          if (existing) {
            return prev.map((i) =>
              i.id === item.id ? { ...i, quantity: clampQty(i, i.quantity + qty) } : i,
            );
          }
          return [...prev, { ...item, quantity: Math.max(1, qty) }];
        }),
      setQuantity: (id, qty) =>
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, quantity: clampQty(i, qty) } : i)),
        ),
      remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
