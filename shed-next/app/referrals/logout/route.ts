import { NextResponse } from 'next/server';
import { affiliateLogout } from '@/lib/server/public/affiliates';

import { isPrefetch } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  await affiliateLogout();
  return NextResponse.redirect(new URL('/referrals/login', req.url));
}
