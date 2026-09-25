import { NextResponse } from 'next/server';
import { currentShopper, shopperOrderForPdf } from '@/lib/server/shopper/account';
import { pdfResponse, renderInvoicePdf } from '@/lib/server/pdf';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { saleId: string } }) {
  const me = await currentShopper();
  if (!me) return NextResponse.redirect(new URL(`/shopper/login?next=${encodeURIComponent(new URL(req.url).pathname)}`, req.url));
  const found = await shopperOrderForPdf(me, params.saleId);
  if (!found) return new Response('Order not found', { status: 404 });
  return pdfResponse(await renderInvoicePdf(found.sale, found.admin), new URL(req.url).searchParams.get('download') === '1');
}
