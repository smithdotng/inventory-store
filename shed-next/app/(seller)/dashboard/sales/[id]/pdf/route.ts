import { sellerOrError } from '@/lib/server/auth';
import { getSale } from '@/lib/server/seller/sales';
import { pdfResponse, renderInvoicePdf } from '@/lib/server/pdf';

export const dynamic = 'force-dynamic';

/** Invoice / receipt PDF for a sale (inline; ?download=1 to save). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await sellerOrError({ allowLocked: true });
  if ('error' in ctx) return new Response(ctx.error, { status: ctx.status });
  const sale = await getSale(ctx, params.id);
  if (!sale) return new Response('Sale not found', { status: 404 });
  return pdfResponse(await renderInvoicePdf(sale, ctx.admin), new URL(req.url).searchParams.get('download') === '1');
}
