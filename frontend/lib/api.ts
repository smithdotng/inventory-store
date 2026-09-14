import type { Store, Product, Sale } from './types';

// Server-side fetches talk to Express directly; client-side fetches go through
// the Next rewrite proxy (same origin). BACKEND_URL is only read on the server.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

function base(): string {
  return typeof window === 'undefined' ? BACKEND_URL : '';
}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function getStore(username: string) {
  return getJSON<{ store: Store; products: Product[] }>(
    `/api/public/store/${encodeURIComponent(username)}`,
  );
}

export function getProduct(username: string, productId: string) {
  return getJSON<{ store: Store; product: Product }>(
    `/api/public/store/${encodeURIComponent(username)}/product/${productId}`,
  );
}

export function getOrder(username: string, saleId: string, token: string) {
  return getJSON<{ store: Store; sale: Sale; pdfUrl: string }>(
    `/api/public/store/${encodeURIComponent(username)}/order/${saleId}?token=${encodeURIComponent(token)}`,
  );
}

export interface CheckoutPayload {
  customerName: string;
  phoneNumber: string;
  email: string;
  cartItems: { id: string; name: string; cost: number; quantity: number }[];
}

/**
 * Reuses the existing Express checkout route (which runs the full transaction +
 * notifications and returns { success, invoiceUrl }). We parse the saleId +
 * token out of the returned invoiceUrl so the caller can route to the order page.
 */
export async function checkout(
  username: string,
  payload: CheckoutPayload,
): Promise<{ saleId: string; token: string }> {
  const res = await fetch(`/store/${encodeURIComponent(username)}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: payload.customerName,
      phoneNumber: payload.phoneNumber,
      email: payload.email,
      // The Express route expects cartItems as a JSON string.
      cartItems: JSON.stringify(payload.cartItems),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.details || 'Checkout failed');
  }

  // invoiceUrl: /store/<username>/confirmation/<saleId>?token=<token>
  const match = /confirmation\/([^?]+)\?token=([^&]+)/.exec(data.invoiceUrl || '');
  if (!match) throw new Error('Unexpected checkout response');
  return { saleId: match[1], token: match[2] };
}
