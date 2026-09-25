import { NextResponse } from 'next/server';
import { handleCheckoutCallback } from '@/lib/server/shopper/cart';

export const dynamic = 'force-dynamic';

/** Flutterwave redirects shoppers here after paying online. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const to = await handleCheckoutCallback({ status: u.get('status'), tx_ref: u.get('tx_ref'), transaction_id: u.get('transaction_id') });
  return NextResponse.redirect(new URL(to, req.url));
}
