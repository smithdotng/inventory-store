import { NextResponse } from 'next/server';
import { signOut } from '@/lib/server/auth-actions';

import { isPrefetch } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  await signOut();
  return NextResponse.redirect(new URL('/admin-login', req.url));
}
export const POST = GET;
