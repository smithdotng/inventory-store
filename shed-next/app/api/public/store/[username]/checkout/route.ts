import { checkout } from '@/lib/server/store';
import { handler, json, readBody } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Guest checkout for one store. Accepts cartItems as an array or a JSON string (legacy clients). */
export const POST = handler(async (req: Request, { params }: { params: { username: string } }) => {
  const body = await readBody(req);
  let cartItems = body.cartItems;
  if (typeof cartItems === 'string') {
    try {
      cartItems = JSON.parse(cartItems);
    } catch {
      return json({ error: 'Invalid cart items data' }, 400);
    }
  }
  const r = await checkout(params.username, { customerName: body.customerName, phoneNumber: body.phoneNumber, email: body.email, cartItems });
  return json({ success: true, ...r });
});
