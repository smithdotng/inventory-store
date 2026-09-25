import { getPublicOrder } from '@/lib/server/store';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request, { params }: { params: { username: string; saleId: string } }) => {
  const token = new URL(req.url).searchParams.get('token') || '';
  return json(await getPublicOrder(params.username, params.saleId, token));
});
