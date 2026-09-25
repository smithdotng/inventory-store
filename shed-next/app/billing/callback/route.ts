import { NextResponse } from 'next/server';
import { handleCallback } from '@/lib/server/seller/billing';

export const dynamic = 'force-dynamic';

/** Flutterwave redirects here after the subscription checkout. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const to = await handleCallback({ status: u.get('status'), tx_ref: u.get('tx_ref'), transaction_id: u.get('transaction_id') });
  return NextResponse.redirect(new URL(to, req.url));
}
