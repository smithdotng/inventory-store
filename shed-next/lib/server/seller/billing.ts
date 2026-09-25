import 'server-only';
import { getDb, oid } from '../db';
import { env } from '../env';
import { sendMailSafe } from '../mailer';
import * as flw from '../flutterwave';
import { RENEWAL_PERIOD_DAYS, SUBSCRIPTION_AMOUNT, SUBSCRIPTION_CURRENCY, daysLeftInTrial, isAccountLocked } from '../subscription';
import { escapeHtml } from '../store';

/* Store subscription billing (port of billingController.js). */

export function billingSummary(admin: any) {
  const sub = admin.subscription || null;
  return {
    status: (sub?.legacyAccount ? 'legacy' : sub?.status) || 'legacy',
    locked: isAccountLocked(admin),
    daysLeft: daysLeftInTrial(admin),
    trialEndsAt: sub?.trialEndsAt ? new Date(sub.trialEndsAt).toISOString() : null,
    currentPeriodEnd: sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null,
    card: sub?.card?.last4 ? { last4: sub.card.last4, brand: sub.card.brand || 'Card', expiry: sub.card.expiry || '' } : null,
    amount: SUBSCRIPTION_AMOUNT,
    currency: SUBSCRIPTION_CURRENCY,
    configured: flw.flutterwaveConfigured,
  };
}

export async function recentCharges(adminId: any) {
  const db = await getDb();
  const rows = await db.collection('subscription_charges').find({ adminId }).sort({ createdAt: -1 }).limit(12).toArray();
  return rows.map((r) => ({ id: String(r._id), amount: r.amount, currency: r.currency, status: r.status, date: new Date(r.createdAt).toISOString() }));
}

export async function startSubscription(admin: any): Promise<string> {
  if (!flw.flutterwaveConfigured) throw new Error('Payments are not configured yet. Please contact support.');
  const txRef = `SUB-${admin._id}-${Date.now()}`;
  const link = await flw.initializeStandardPayment({
    amount: SUBSCRIPTION_AMOUNT,
    currency: SUBSCRIPTION_CURRENCY,
    email: admin.email,
    name: admin.businessName || admin.username,
    phone: admin.phone,
    tx_ref: txRef,
    redirect_url: `${env.baseUrl}/billing/callback`,
    title: 'Shed Store Subscription',
    description: `Monthly subscription — ${SUBSCRIPTION_CURRENCY} ${SUBSCRIPTION_AMOUNT}/month`,
    meta: { adminId: String(admin._id), type: 'subscription' },
  });
  const db = await getDb();
  await db.collection('admins').updateOne({ _id: admin._id }, { $set: { 'subscription.pendingTxRef': txRef } });
  return link;
}

/** Handles the Flutterwave redirect. Returns the path to send the user to. */
export async function handleCallback(q: { status?: string | null; tx_ref?: string | null; transaction_id?: string | null }) {
  const fail = (m: string) => `/dashboard/billing?error=${encodeURIComponent(m)}`;
  const txRef = q.tx_ref || '';
  if (!txRef.startsWith('SUB-')) return fail('Invalid payment reference.');
  const adminId = oid(txRef.split('-')[1]);
  if (!adminId) return fail('Invalid payment reference.');
  const db = await getDb();
  const admin = await db.collection('admins').findOne({ _id: adminId });
  if (!admin) return '/admin-login';
  if (q.status !== 'successful' || !q.transaction_id) return fail('Payment was not completed.');
  try {
    const v = await flw.verifyTransactionById(q.transaction_id);
    const ok = v.status === 'successful' && v.tx_ref === txRef && Number(v.amount) >= SUBSCRIPTION_AMOUNT - 1;
    if (!ok) return fail('We could not verify your payment. If you were charged, contact support.');
    await activateSubscription(admin, txRef, q.transaction_id, v.amount, v.card);
    return '/dashboard/billing?success=1';
  } catch (e: any) {
    console.error('Billing callback error:', e?.message);
    return fail('Something went wrong confirming your payment.');
  }
}

/** Webhook (server-to-server). Idempotent on the Flutterwave transaction id. */
export async function handleWebhook(event: any) {
  if (event?.event !== 'charge.completed') return;
  const d = event.data || {};
  if (d.status !== 'successful') return;
  const txRef = String(d.tx_ref || '');
  if (!txRef.startsWith('SUB-')) return;
  const adminId = oid(txRef.split('-')[1]);
  if (!adminId) return;
  const db = await getDb();
  const admin = await db.collection('admins').findOne({ _id: adminId });
  if (admin) await activateSubscription(admin, txRef, d.id, d.amount, d.card);
}

export async function activateSubscription(admin: any, txRef: string, transactionId: string | number, amount: number, card: any = {}) {
  const db = await getDb();
  if (await db.collection('subscription_charges').findOne({ flwRef: String(transactionId) })) return; // already processed
  const now = new Date();
  const end = new Date(now.getTime() + RENEWAL_PERIOD_DAYS * 86400000);
  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        'subscription.status': 'active',
        'subscription.card': { token: card?.token || null, last4: card?.last_4digits || null, expiry: card?.expiry || null, brand: card?.type || null },
        'subscription.currentPeriodEnd': end,
        'subscription.failedAttempts': 0,
        'subscription.lastChargeAt': now,
        'subscription.lastChargeStatus': 'successful',
        'subscription.pendingTxRef': null,
      },
    },
  );
  await db.collection('subscription_charges').insertOne({ adminId: admin._id, amount, currency: SUBSCRIPTION_CURRENCY, flwRef: String(transactionId), txRef, status: 'successful', createdAt: now });
  if (admin.email) {
    sendMailSafe({
      from: env.businessUser,
      to: admin.email,
      subject: 'Your Shed subscription is active',
      html: `<p>Hi ${escapeHtml(admin.firstName || admin.username || 'there')},</p><p>Your ₦${SUBSCRIPTION_AMOUNT.toLocaleString()}/month Shed subscription is now active. Your next charge is on ${end.toDateString()}.</p>`,
    });
  }
}
