import { currentShopper } from '@/lib/server/shopper/account';
import { startOnlineCheckout } from '@/lib/server/shopper/cart';
import { handler, json, readBody } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Start a Flutterwave payment for the given cart lines. Returns { link }. */
export const POST = handler(async (req: Request) => {
  const me = await currentShopper();
  if (!me) return json({ error: 'Please sign in to pay online.' }, 401);
  const { items } = await readBody(req);
  const lines = Array.isArray(items) ? items.map((i: any) => ({ itemId: String(i.id || i.itemId), quantity: Number(i.quantity) || 1 })) : [];
  return json({ link: await startOnlineCheckout(me, lines) });
});
