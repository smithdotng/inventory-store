const cron = require('node-cron');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const flutterwave = require('../config/flutterwave');
const {
  SUBSCRIPTION_AMOUNT,
  SUBSCRIPTION_CURRENCY,
  RENEWAL_PERIOD_DAYS,
  MAX_RENEWAL_ATTEMPTS
} = require('../utils/subscription');

async function chargeRenewal(db, admin) {
  const txRef = `SUB-RENEW-${admin._id.toString()}-${Date.now()}`;
  try {
    const result = await flutterwave.chargeWithToken({
      token: admin.subscription.card.token,
      amount: SUBSCRIPTION_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      email: admin.email,
      tx_ref: txRef,
      first_name: admin.firstName || admin.username,
      last_name: admin.lastName || ''
    });

    const chargeStatus = result?.data?.status;
    const now = new Date();

    if (result.status === 'success' && chargeStatus === 'successful') {
      const currentPeriodEnd = new Date(now.getTime() + RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      await db.collection('admins').updateOne(
        { _id: admin._id },
        {
          $set: {
            'subscription.status': 'active',
            'subscription.currentPeriodEnd': currentPeriodEnd,
            'subscription.failedAttempts': 0,
            'subscription.lastChargeAt': now,
            'subscription.lastChargeStatus': 'successful'
          }
        }
      );
      await db.collection('subscription_charges').insertOne({
        adminId: admin._id, amount: SUBSCRIPTION_AMOUNT, currency: SUBSCRIPTION_CURRENCY,
        flwRef: String(result?.data?.id || txRef), txRef, status: 'successful', createdAt: now
      });
      console.log(`[subscription] Renewed ${admin.username} — next charge ${currentPeriodEnd.toDateString()}`);
      return;
    }

    throw new Error(chargeStatus || result.message || 'Charge did not succeed');
  } catch (err) {
    console.error(`[subscription] Renewal charge failed for ${admin.username}:`, err.response?.data?.message || err.message);
    const attempts = (admin.subscription.failedAttempts || 0) + 1;
    const expired = attempts >= MAX_RENEWAL_ATTEMPTS;

    await db.collection('admins').updateOne(
      { _id: admin._id },
      {
        $set: {
          'subscription.status': expired ? 'expired' : 'past_due',
          'subscription.failedAttempts': attempts,
          'subscription.lastChargeAt': new Date(),
          'subscription.lastChargeStatus': 'failed'
        }
      }
    );
    await db.collection('subscription_charges').insertOne({
      adminId: admin._id, amount: SUBSCRIPTION_AMOUNT, currency: SUBSCRIPTION_CURRENCY,
      flwRef: txRef, txRef, status: 'failed', createdAt: new Date()
    });

    if (admin.email) {
      const subject = expired ? 'Your Shed subscription has been paused' : 'We could not renew your Shed subscription';
      const body = expired
        ? `<p>Hi ${admin.username},</p><p>After several failed attempts we've paused your store. Log in to <a href="${process.env.BASE_URL}/billing">/billing</a> and add a new card to reactivate.</p>`
        : `<p>Hi ${admin.username},</p><p>Your monthly ₦${SUBSCRIPTION_AMOUNT} charge failed. We'll retry over the next few days — you can also update your card at <a href="${process.env.BASE_URL}/billing">/billing</a>.</p>`;
      transporter.sendMail({ from: process.env.BUSINESS_USER || 'stanley@shed.ng', to: admin.email, subject, html: body })
        .catch(e => console.error('Renewal notice email failed:', e.message));
    }
  }
}

async function sendTrialReminders(db) {
  const now = new Date();
  const reminderWindowStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const reminderWindowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const dueSoon = await db.collection('admins').find({
    'subscription.status': 'trial',
    'subscription.trialEndsAt': { $gte: reminderWindowStart, $lte: reminderWindowEnd },
    'subscription.trialReminderSentAt': null
  }).toArray();

  for (const admin of dueSoon) {
    if (!admin.email) continue;
    transporter.sendMail({
      from: process.env.BUSINESS_USER || 'stanley@shed.ng',
      to: admin.email,
      subject: 'Your Shed free trial ends soon',
      html: `<p>Hi ${admin.username},</p><p>Your 14-day free trial ends on ${new Date(admin.subscription.trialEndsAt).toLocaleDateString()}. Add a card at <a href="${process.env.BASE_URL}/billing">/billing</a> to keep your store online — it's ₦${SUBSCRIPTION_AMOUNT}/month.</p>`
    }).catch(e => console.error('Trial reminder email failed:', e.message));
    await db.collection('admins').updateOne({ _id: admin._id }, { $set: { 'subscription.trialReminderSentAt': now } });
  }
}

async function expireEndedTrials(db) {
  await db.collection('admins').updateMany(
    { 'subscription.status': 'trial', 'subscription.trialEndsAt': { $lt: new Date() } },
    { $set: { 'subscription.status': 'expired' } }
  );
}

async function runRenewalSweep() {
  const db = getDb();
  if (!db) return;

  try {
    await sendTrialReminders(db);
    await expireEndedTrials(db);

    if (!flutterwave.flutterwaveConfigured) return; // nothing to charge without keys

    const due = await db.collection('admins').find({
      'subscription.status': { $in: ['active', 'past_due'] },
      'subscription.card.token': { $exists: true, $ne: null },
      'subscription.currentPeriodEnd': { $lte: new Date() }
    }).toArray();

    for (const admin of due) {
      await chargeRenewal(db, admin);
    }
  } catch (err) {
    console.error('[subscription] Renewal sweep failed:', err.message);
  }
}

function startSubscriptionRenewalJob() {
  // Daily at 03:00 — trial reminders, trial expiry, and recurring card charges.
  cron.schedule('0 3 * * *', () => {
    console.log('[subscription] Running daily renewal sweep...');
    runRenewalSweep();
  });
  console.log('[subscription] Renewal cron scheduled (daily 03:00).');
}

module.exports = { startSubscriptionRenewalJob, runRenewalSweep };
