import 'server-only';

// Port of config/flutterwave.js (uses fetch instead of axios).
const BASE = 'https://api.flutterwave.com/v3';
const SECRET = process.env.FLW_SECRET_KEY || '';
export const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || '';
const SECRET_HASH = process.env.FLW_SECRET_HASH || '';
export const flutterwaveConfigured = Boolean(SECRET && FLW_PUBLIC_KEY);

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data as any;
}

/** Hosted checkout — returns the URL to send the customer to. */
export async function initializeStandardPayment(o: {
  amount: number;
  currency?: string;
  email: string;
  name: string;
  phone?: string;
  tx_ref: string;
  redirect_url: string;
  meta?: Record<string, unknown>;
  title?: string;
  description?: string;
}): Promise<string> {
  const data = await call('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: o.tx_ref,
      amount: o.amount,
      currency: o.currency || 'NGN',
      redirect_url: o.redirect_url,
      customer: { email: o.email, name: o.name, phonenumber: o.phone },
      customizations: { title: o.title || 'Shed', description: o.description || 'Payment on Shed' },
      meta: o.meta || {},
    }),
  });
  if (data.status !== 'success' || !data.data?.link) throw new Error(data.message || 'Failed to initialize Flutterwave payment');
  return data.data.link;
}

/** Always re-verify server-side before trusting a payment. */
export async function verifyTransactionById(id: string | number) {
  const data = await call(`/transactions/${encodeURIComponent(String(id))}/verify`);
  if (data.status !== 'success' || !data.data) throw new Error(data.message || 'Unable to verify transaction');
  return data.data;
}

/** Charge a saved card token (monthly renewals). */
export async function chargeWithToken(o: { token: string; amount: number; currency?: string; email: string; tx_ref: string; first_name?: string; last_name?: string }) {
  return call('/tokenized-charges', { method: 'POST', body: JSON.stringify({ ...o, currency: o.currency || 'NGN' }) });
}

export function verifyWebhookSignature(headers: Headers) {
  if (!SECRET_HASH) return false;
  const sig = headers.get('verif-hash');
  return Boolean(sig && sig === SECRET_HASH);
}
