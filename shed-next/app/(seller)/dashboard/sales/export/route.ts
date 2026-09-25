import { sellerOrError } from '@/lib/server/auth';
import { listSales } from '@/lib/server/seller/sales';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV download of the filtered sales list. */
export async function GET(req: Request) {
  const ctx = await sellerOrError();
  if ('error' in ctx) return new Response(ctx.error, { status: ctx.status });
  const u = new URL(req.url).searchParams;
  const status = u.get('status') === 'paid' || u.get('status') === 'pending' ? (u.get('status') as 'paid' | 'pending') : '';
  const rows: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await listSales(ctx, { q: u.get('q') || '', from: u.get('from') || '', to: u.get('to') || '', status, source: u.get('source') || '', page, limit: 100 });
    rows.push(...r.rows);
    if (page >= r.pages) break;
  }
  const lines = [['Date', 'Sale ID', 'Customer', 'Items', 'Channel', 'Payment method', 'Status', 'Total'].join(',')];
  for (const s of rows) {
    lines.push(
      [
        s.date ? new Date(s.date).toISOString().replace('T', ' ').slice(0, 16) : '',
        s._id,
        s.customerName || '',
        (s.items || []).map((i: any) => `${i.itemName} x${i.quantity}`).join('; '),
        s.outletName ? `Outlet: ${s.outletName}` : s.source || '',
        s.paymentMethod || '',
        s.paymentStatus || '',
        (s.totalAmount || 0).toFixed(2),
      ].map(cell).join(','),
    );
  }
  return new Response('﻿' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="shed-sales-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
