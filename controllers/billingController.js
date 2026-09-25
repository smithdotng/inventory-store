const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const flutterwave = require('../config/flutterwave');
const { getCurrentAdmin } = require('../utils/helpers');
const {
  isAccountLocked,
  daysLeftInTrial,
  SUBSCRIPTION_AMOUNT,
  SUBSCRIPTION_CURRENCY,
  RENEWAL_PERIOD_DAYS
} = require('../utils/subscription');

const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.trim() : 'http://localhost:3000';

// ── GET /billing ─────────────────────────────────────────────────────────────
exports.getBilling = async (req, res) => {
  try {
    const admin = await getCurrentAdmin(req);
    if (!admin) return res.redirect('/admin-login');

    res.render('billing', {
      admin,
      locked: isAccountLocked(admin),
      daysLeft: daysLeftInTrial(admin),
      amount: SUBSCRIPTION_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      flwConfigured: flutterwave.flutterwaveConfigured,
      justSubscribed: req.query.success === '1',
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Billing page error:', err);
    res.status(500).render('500', { message: 'Error loading billing page' });
  }
};

// ── POST /billing/subscribe — first-time card payment, redirect to Flutterwave
exports.postSubscribe = async (req, res) => {
  try {
    const admin = await getCurrentAdmin(req);
    if (!admin) return res.redirect('/admin-login');

    if (!flutterwave.flutterwaveConfigured) {
      return res.redirect('/billing?error=' + encodeURIComponent('Payments are not configured yet. Contact support.'));
    }

    const txRef = `SUB-${admin._id.toString()}-${Date.now()}`;
    const link = await flutterwave.initializeStandardPayment({
      amount: SUBSCRIPTION_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      email: admin.email,
      name: admin.businessName || admin.username,
      phone: admin.phone,
      tx_ref: txRef,
      redirect_url: `${BASE_URL}/billing/callback`,
      title: 'Shed Store Subscription',
      description: `Monthly subscription — ${SUBSCRIPTION_CURRENCY} ${SUBSCRIPTION_AMOUNT}/month`,
      meta: { adminId: admin._id.toString(), type: 'subscription' }
    });

    const db = getDb();
    await db.collection('admins').updateOne({ _id: admin._id }, { $set: { 'subscription.pendingTxRef': txRef } });

    res.redirect(link);
  } catch (err) {
    console.error('Subscribe init error:', err.response?.data || err.message);
    res.redirect('/billing?error=' + encodeURIComponent('Could not start payment. Please try again.'));
  }
};

// ── GET /billing/callback ────────────────────────────────────────────────────
exports.getCallback = async (req, res) => {
  const db = getDb();
  const { status, tx_ref, transaction_id } = req.query;

  try {
    if (!tx_ref || !tx_ref.startsWith('SUB-')) {
      return res.redirect('/billing?error=' + encodeURIComponent('Invalid payment reference.'));
    }
    const adminId = tx_ref.split('-')[1];
    if (!ObjectId.isValid(adminId)) return res.redirect('/billing?error=' + encodeURIComponent('Invalid payment reference.'));

    const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
    if (!admin) return res.redirect('/admin-login');

    if (status !== 'successful' || !transaction_id) {
      return res.redirect('/billing?error=' + encodeURIComponent('Payment was not completed.'));
    }

    const verified = await flutterwave.verifyTransactionById(transaction_id);
    const ok = verified.status === 'successful' && verified.tx_ref === tx_ref &&
      Number(verified.amount) >= SUBSCRIPTION_AMOUNT - 1;

    if (!ok) {
      return res.redirect('/billing?error=' + encodeURIComponent('We could not verify your payment. If you were charged, contact support.'));
    }

    const card = verified.card || {};
    await activateSubscription({
      db,
      admin,
      txRef: tx_ref,
      transactionId: transaction_id,
      amount: verified.amount,
      card: {
        token: card.token || null,
        last4: card.last_4digits || null,
        expiry: card.expiry || null,
        brand: card.type || null
      }
    });

    res.redirect('/billing?success=1');
  } catch (err) {
    console.error('Billing callback error:', err.response?.data || err.message);
    res.redirect('/billing?error=' + encodeURIComponent('Something went wrong confirming your payment.'));
  }
};

// ── POST /webhooks/flutterwave — server-to-server confirmation (belt & braces)
exports.postWebhook = async (req, res) => {
  const db = getDb();
  try {
    if (!flutterwave.verifyWebhookSignature(req)) return res.status(401).send('Invalid signature');

    const event = req.body;
    res.status(200).send('OK'); // ack immediately, process after

    if (event.event !== 'charge.completed') return;
    const data = event.data || {};
    if (data.status !== 'successful') return;

    const txRef = data.tx_ref || '';
    const alreadyLogged = await db.collection('subscription_charges').findOne({ flwRef: String(data.id) });
    if (alreadyLogged) return; // idempotent

    if (txRef.startsWith('SUB-')) {
      const adminId = txRef.split('-')[1];
      if (!ObjectId.isValid(adminId)) return;
      const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
      if (!admin) return;

      const card = data.card || {};
      await activateSubscription({
        db,
        admin,
        txRef,
        transactionId: data.id,
        amount: data.amount,
        card: { token: card.token || null, last4: card.last_4digits || null, expiry: card.expiry || null, brand: card.type || null }
      });
    }
    // Cart-checkout webhooks are handled via the redirect callback in
    // cartController; this endpoint focuses on subscription reliability.
  } catch (err) {
    console.error('Flutterwave webhook error:', err.message);
  }
};

async function activateSubscription({ db, admin, txRef, transactionId, amount, card }) {
  const now = new Date();
  const currentPeriodEnd = new Date(now.getTime() + RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        'subscription.status': 'active',
        'subscription.card': card,
        'subscription.currentPeriodEnd': currentPeriodEnd,
        'subscription.failedAttempts': 0,
        'subscription.lastChargeAt': now,
        'subscription.lastChargeStatus': 'successful',
        'subscription.pendingTxRef': null
      }
    }
  );

  await db.collection('subscription_charges').insertOne({
    adminId: admin._id,
    amount,
    currency: SUBSCRIPTION_CURRENCY,
    flwRef: String(transactionId),
    txRef,
    status: 'successful',
    createdAt: now
  });

  if (admin.email) {
    transporter.sendMail({
      from: process.env.BUSINESS_USER || 'stanley@shed.ng',
      to: admin.email,
      subject: 'Your Shed subscription is active',
      html: `<p>Hi ${admin.username || 'there'},</p><p>Your ₦${SUBSCRIPTION_AMOUNT}/month Shed subscription is now active. Your next charge is on ${currentPeriodEnd.toLocaleDateString()}.</p>`
    }).catch(e => console.error('Subscription email failed:', e.message));
  }
}

exports.activateSubscription = activateSubscription;
