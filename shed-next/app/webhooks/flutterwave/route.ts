import { verifyWebhookSignature } from '@/lib/server/flutterwave';
import { handleWebhook } from '@/lib/server/seller/billing';
import { handleCartWebhook } from '@/lib/server/shopper/cart';

export const dynamic = 'force-dynamic';

/** Server-to-server payment confirmations from Flutterwave. */
export async function POST(req: Request) {
  if (!verifyWebhookSignature(req.headers)) return new Response('Invalid signature', { status: 401 });
  const event = await req.json().catch(() => null);
  try {
    await handleWebhook(event);
    await handleCartWebhook(event);
  } catch (e: any) {
    console.error('Flutterwave webhook error:', e?.message);
  }
  return new Response('OK');
}
