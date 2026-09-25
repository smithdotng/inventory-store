import { currentShopper } from '@/lib/server/shopper/account';
import { flutterwaveConfigured } from '@/lib/server/flutterwave';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const me = await currentShopper();
  return json({ shopper: me ? { firstName: me.firstName, email: me.email } : null, onlinePayments: flutterwaveConfigured });
});
