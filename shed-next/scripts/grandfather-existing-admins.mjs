// One-off: mark every store created before subscriptions existed as a free
// "legacy" account so trials/billing never lock them.
// Usage: node --env-file=.env.local scripts/grandfather-existing-admins.mjs
import { MongoClient } from 'mongodb';

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.DB_NAME);
const r = await db.collection('admins').updateMany(
  { subscription: { $exists: false } },
  { $set: { subscription: { status: 'legacy', legacyAccount: true, plan: null, amount: null, currency: null, trialStartedAt: null, trialEndsAt: null, trialReminderSentAt: null, currentPeriodEnd: null, card: null, failedAttempts: 0, lastChargeAt: null, lastChargeStatus: null } } },
);
console.log(`Grandfathered ${r.modifiedCount} existing store account(s).`);
await client.close();
