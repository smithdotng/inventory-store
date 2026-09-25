import { NextResponse } from 'next/server';
import { signOutShopper } from '@/lib/server/shopper/account';

import { isPrefetch } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  await signOutShopper();
  return NextResponse.redirect(new URL('/', req.url));
}
export const POST = GET;
