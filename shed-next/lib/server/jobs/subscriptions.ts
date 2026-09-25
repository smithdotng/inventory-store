import 'server-only';
import { getDb } from '../db';
import { env } from '../env';
import { sendMailSafe } from '../mailer';
import * as flw from '../flutterwave';
import { MAX_RENEWAL_ATTEMPTS, RENEWAL_PERIOD_DAYS, SUBSCRIPTION_AMOUNT, SUBSCRIPTION_CURRENCY } from '../subscription';
import { escapeHtml } from '../store';

/* Daily subscription sweep (port of jobs/subscriptionRenewal.js):
 * trial reminders → expire ended trials → charge saved cards that are due. */

async function chargeRenewal(admin: any) {
  const db = await getDb();
  const txRef = `SUB-RENEW-${admin._id}-${Date.now()}`;
  const now = new Date();
  try {
    const r = await flw.chargeWithToken({ token: admin.subscription.card.token, amount: SUBSCRIPTION_AMOUNT, currency: SUBSCRIPTION_CURRENCY, email: admin.email, tx_ref: txRef, first_name: admin.firstName || admin.username, last_name: admin.lastName || '' });
    if (r?.status === 'success' && r?.data?.status === 'successful') {
      await db.collection('admins').updateOne(
        { _id: admin._id },
        { $set: { 'subscription.status': 'active', 'subscription.currentPeriodEnd': new Date(now.getTime() + RENEWAL_PERIOD_DAYS * 86400000), 'subscription.failedAttempts': 0, 'subscription.lastChargeAt': now, 'subscription.lastChargeStatus': 'successful' } },
      );
      await db.collection('subscription_charges').insertOne({ adminId: admin._id, amount: SUBSCRIPTION_AMOUNT, currency: SUBSCRIPTION_CURRENCY, flwRef: String(r?.data?.id || txRef), txRef, status: 'successful', createdAt: now });
      return 'charged';
    }
    throw new Error(r?.data?.status || r?.message || 'Charge did not succeed');
  } catch (e: any) {
    const attempts = (admin.subscription.failedAttempts || 0) + 1;
    const expired = attempts >= MAX_RENEWAL_ATTEMPTS;
    await db.collection('admins').updateOne(
      { _id: admin._id },
      { $set: { 'subscription.status': expired ? 'expired' : 'past_due', 'subscription.failedAttempts': attempts, 'subscription.lastChargeAt': now, 'subscription.lastChargeStatus': 'failed' } },
    );
    await db.collection('subscription_charges').insertOne({ adminId: admin._id, amount: SUBSCRIPTION_AMOUNT, currency: SUBSCRIPTION_CURRENCY, flwRef: txRef, txRef, status: 'failed', error: e?.message, createdAt: now });
    if (admin.email) {
      sendMailSafe({
        from: env.businessUser,
        to: admin.email,
        subject: expired ? 'Your Shed store has been paused' : 'We could not renew your Shed subscription',
        html: expired
          ? `<p>Hi ${escapeHtml(admin.firstName || admin.username)},</p><p>After several failed attempts we've paused your store. <a href="${env.baseUrl}/dashboard/billing">Add a new card</a> to reactivate it — your data is safe.</p>`
          : `<p>Hi ${escapeHtml(admin.firstName || admin.username)},</p><p>Your monthly ₦${SUBSCRIPTION_AMOUNT.toLocaleString()} charge failed. We'll retry over the next few days, or you can <a href="${env.baseUrl}/dashboard/billing">update your card</a>.</p>`,
      });
    }
    return expired ? 'expired' : 'failed';
  }
}

export async function runSubscriptionSweep() {
  const db = await getDb();
  const now = new Date();
  const summary = { reminders: 0, expired: 0, charged: 0, failed: 0 };

  const dueSoon = await db.collection('admins').find({ 'subscription.status': 'trial', 'subscription.trialEndsAt': { $gte: new Date(now.getTime() + 2 * 86400000), $lte: new Date(now.getTime() + 3 * 86400000) }, 'subscription.trialReminderSentAt': null }).toArray();
  for (const a of dueSoon) {
    if (a.email) {
      sendMailSafe({ from: env.businessUser, to: a.email, subject: 'Your Shed free trial ends soon', html: `<p>Hi ${escapeHtml(a.firstName || a.username)},</p><p>Your free trial ends on ${new Date(a.subscription.trialEndsAt).toDateString()}. <a href="${env.baseUrl}/dashboard/billing">Subscribe</a> to keep your store online — it's ₦${SUBSCRIPTION_AMOUNT.toLocaleString()}/month.</p>` });
      summary.reminders++;
    }
    await db.collection('admins').updateOne({ _id: a._id }, { $set: { 'subscription.trialReminderSentAt': now } });
  }

  const exp = await db.collection('admins').updateMany({ 'subscription.status': 'trial', 'subscription.trialEndsAt': { $lt: now } }, { $set: { 'subscription.status': 'expired' } });
  summary.expired = exp.modifiedCount;

  if (flw.flutterwaveConfigured) {
    const due = await db.collection('admins').find({ 'subscription.status': { $in: ['active', 'past_due'] }, 'subscription.card.token': { $exists: true, $ne: null }, 'subscription.currentPeriodEnd': { $lte: now } }).toArray();
    for (const a of due) {
      const r = await chargeRenewal(a);
      if (r === 'charged') summary.charged++;
      else summary.failed++;
    }
  }
  await db.collection('job_runs').insertOne({ job: 'subscriptions', at: now, summary }).catch(() => {});
  return summary;
}
