'use client';

/**
 * Browser-side calls to our own route handlers. (Server components import
 * data functions directly from lib/server/store — no HTTP hop.)
 */
export interface CheckoutPayload {
  customerName: string;
  phoneNumber: string;
  email: string;
  cartItems: { id: string; name: string; cost: number; quantity: number }[];
}

export async function checkout(username: string, payload: CheckoutPayload): Promise<{ saleId: string; token: string }> {
  const res = await fetch(`/api/public/store/${encodeURIComponent(username)}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'We could not place your order. Please try again.');
  return { saleId: data.saleId, token: data.token };
}
