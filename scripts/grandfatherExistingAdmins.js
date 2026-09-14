// One-off migration: explicitly mark every admin that existed before the
// subscription/trial feature shipped as a "legacy" account so they're never
// affected by trial expiry or billing lockouts. New self-registrations get a
// real `subscription` object (see controllers/authController.js) — anything
// without one, or with legacyAccount:true, is treated as unrestricted by
// utils/subscription.js#isAccountLocked.
//
// Run once: node scripts/grandfatherExistingAdmins.js
require('dotenv').config();
const { connectToMongo, getDb } = require('../config/db');

async function run() {
  await connectToMongo();
  // connectToMongo sets up indexes asynchronously; give it a moment.
  await new Promise(r => setTimeout(r, 1500));
  const db = getDb();

  const result = await db.collection('admins').updateMany(
    { subscription: { $exists: false } },
    {
      $set: {
        subscription: {
          status: 'legacy',
          legacyAccount: true,
          plan: null,
          amount: null,
          currency: null,
          trialStartedAt: null,
          trialEndsAt: null,
          trialReminderSentAt: null,
          currentPeriodEnd: null,
          card: null,
          failedAttempts: 0,
          lastChargeAt: null,
          lastChargeStatus: null
        }
      }
    }
  );

  console.log(`Grandfathered ${result.modifiedCount} existing admin account(s).`);
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
