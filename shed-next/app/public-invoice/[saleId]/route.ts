import { getDb, oid } from '@/lib/server/db';
import { pdfResponse, renderInvoicePdf } from '@/lib/server/pdf';

export const dynamic = 'force-dynamic';

/** Shareable invoice link (kept from the old app: /public-invoice/:saleId). */
export async function GET(req: Request, { params }: { params: { saleId: string } }) {
  const _id = oid(params.saleId);
  if (!_id) return new Response('Invoice not found', { status: 404 });
  const db = await getDb();
  const sale = await db.collection('sales').findOne({ _id });
  if (!sale) return new Response('Invoice not found', { status: 404 });
  const admin = await db.collection('admins').findOne({ _id: sale.adminId });
  return pdfResponse(await renderInvoicePdf(sale, admin || {}), new URL(req.url).searchParams.get('download') === '1');
}
