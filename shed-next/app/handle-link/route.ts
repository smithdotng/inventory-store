import { NextResponse } from 'next/server';

/** PWA protocol handler (web+shed://...) from the old app. */
export function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url') || '';
  const to = url.startsWith('web+shed://invoices') ? '/dashboard/invoices' : /web\+shed:\/\/(update-stock|inventory)/.test(url) ? '/dashboard/inventory' : '/dashboard';
  return NextResponse.redirect(new URL(to, req.url));
}
