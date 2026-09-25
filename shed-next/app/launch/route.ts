import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server/session';
import { dashboardUrl } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * PWA start URL. Opening the installed app sends sellers straight to their
 * dashboard (cashiers to the POS, clerks to inventory) and everyone else to
 * the marketplace.
 */
export async function GET(req: Request) {
  const s = await getSession().catch(() => null);
  const to = s && (s.admin || s.userId) ? dashboardUrl(s.role) : s?.outletId ? '/outlet-portal' : '/';
  return NextResponse.redirect(new URL(to, req.url), { headers: { 'Cache-Control': 'no-store' } });
}
