const axios = require('axios');

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || '';
const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || '';
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH || '';

const flutterwaveConfigured = Boolean(FLW_SECRET_KEY && FLW_PUBLIC_KEY);

if (!flutterwaveConfigured) {
  console.warn(
    'FLW_SECRET_KEY / FLW_PUBLIC_KEY are not set. ' +
    'Flutterwave payments (subscriptions + shopper checkout) will fail until these are added to .env.'
  );
}

const client = axios.create({
  baseURL: FLW_BASE_URL,
  headers: {
    Authorization: `Bearer ${FLW_SECRET_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 20000
});

/**
 * Kick off a standard (redirect/hosted) Flutterwave checkout.
 * Used for: shopper cart checkout, and a store owner's first subscription payment
 * (the first charge also returns a card token we save for recurring billing).
 */
async function initializeStandardPayment({ amount, currency = 'NGN', email, name, phone, tx_ref, redirect_url, meta = {}, title, description }) {
  const payload = {
    tx_ref,
    amount,
    currency,
    redirect_url,
    customer: { email, name, phonenumber: phone },
    customizations: {
      title: title || 'Shed',
      description: description || 'Payment on Shed'
    },
    meta
  };

  const { data } = await client.post('/payments', payload);
  if (data.status !== 'success' || !data.data || !data.data.link) {
    throw new Error(data.message || 'Failed to initialize Flutterwave payment');
  }
  return data.data.link; // hosted checkout URL to redirect the user to
}

/**
 * Verify a transaction by its Flutterwave transaction id (returned on the redirect
 * as `transaction_id`). Always re-verify server-side before trusting a payment —
 * never trust the `status` query param alone.
 */
async function verifyTransactionById(transactionId) {
  const { data } = await client.get(`/transactions/${transactionId}/verify`);
  if (data.status !== 'success' || !data.data) {
    throw new Error(data.message || 'Unable to verify transaction');
  }
  return data.data;
}

/**
 * Charge a previously-saved card token without redirecting the user.
 * Used for the monthly recurring 7200 subscription charge.
 */
async function chargeWithToken({ token, amount, currency = 'NGN', email, tx_ref, first_name, last_name }) {
  const payload = { token, currency, amount, email, tx_ref, first_name, last_name };
  const { data } = await client.post('/tokenized-charges', payload);
  return data; // caller inspects data.status / data.data.status ('successful' | 'failed' | 'pending')
}

/**
 * Verify the `verif-hash` header Flutterwave sends on every webhook call against
 * the secret hash configured in the Flutterwave dashboard (and in FLW_SECRET_HASH).
 */
function verifyWebhookSignature(req) {
  if (!FLW_SECRET_HASH) return false;
  const signature = req.headers['verif-hash'];
  return Boolean(signature && signature === FLW_SECRET_HASH);
}

module.exports = {
  flutterwaveConfigured,
  FLW_PUBLIC_KEY,
  initializeStandardPayment,
  verifyTransactionById,
  chargeWithToken,
  verifyWebhookSignature
};
