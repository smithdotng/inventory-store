import { NextResponse } from 'next/server';
import { outletSignOut } from '@/lib/server/seller/outlets';

import { isPrefetch } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  await outletSignOut();
  return NextResponse.redirect(new URL('/outlet-login', req.url));
}
