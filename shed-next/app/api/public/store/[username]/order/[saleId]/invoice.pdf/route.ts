import { getPublicOrderForPdf } from '@/lib/server/store';
import { handler } from '@/lib/server/http';
import { pdfResponse, renderInvoicePdf } from '@/lib/server/pdf';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request, { params }: { params: { username: string; saleId: string } }) => {
  const u = new URL(req.url).searchParams;
  const { sale, admin } = await getPublicOrderForPdf(params.username, params.saleId, u.get('token') || '');
  return pdfResponse(await renderInvoicePdf(sale, admin), u.get('download') === '1');
});
