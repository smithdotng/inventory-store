import { currentShopper } from '@/lib/server/shopper/account';
import { getServerCart, saveServerCart } from '@/lib/server/shopper/cart';
import { handler, json, readBody } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Signed-in shoppers: their saved cart (re-priced from live stock). */
export const GET = handler(async () => {
  const me = await currentShopper();
  if (!me) return json({ signedIn: false, items: [] });
  return json({ signedIn: true, items: await getServerCart(me) });
});

export const PUT = handler(async (req: Request) => {
  const me = await currentShopper();
  if (!me) return json({ error: 'Not signed in' }, 401);
  const { items } = await readBody(req);
  const lines = Array.isArray(items) ? items.map((i: any) => ({ itemId: String(i.id || i.itemId), quantity: Number(i.quantity) || 1 })) : [];
  return json({ signedIn: true, items: await saveServerCart(me, lines) });
});
