const SUBSCRIPTION_AMOUNT = Number(process.env.SUBSCRIPTION_AMOUNT || 7200);
const SUBSCRIPTION_CURRENCY = process.env.FLW_CURRENCY || 'NGN';
const TRIAL_DAYS = 14;
const RENEWAL_PERIOD_DAYS = 30;
const MAX_RENEWAL_ATTEMPTS = 5;

function newTrialSubscription() {
  return {
    status: 'trial', // trial | active | past_due | expired | canceled | comped | legacy
    plan: 'storeowner_monthly',
    amount: SUBSCRIPTION_AMOUNT,
    currency: SUBSCRIPTION_CURRENCY,
    legacyAccount: false,
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    trialReminderSentAt: null,
    currentPeriodEnd: null,
    card: null, // { token, last4, expiry, brand }
    failedAttempts: 0,
    lastChargeAt: null,
    lastChargeStatus: null
  };
}

/**
 * Is this admin currently locked out of their dashboard/storefront?
 * Missing subscription info, or an explicit legacyAccount/comped/active flag,
 * always means "not locked" — only accounts we've deliberately put through the
 * trial flow (new self-registrations) can end up locked.
 */
function isAccountLocked(admin) {
  if (!admin) return false;
  const sub = admin.subscription;
  if (!sub) return false; // legacy admin, never tracked — unrestricted
  if (sub.legacyAccount) return false;
  if (sub.status === 'active' || sub.status === 'comped') return false;

  if (sub.status === 'trial') {
    return Boolean(sub.trialEndsAt) && new Date(sub.trialEndsAt) < new Date();
  }

  // past_due / expired / canceled
  return true;
}

function daysLeftInTrial(admin) {
  const sub = admin && admin.subscription;
  if (!sub || sub.status !== 'trial' || !sub.trialEndsAt) return 0;
  const ms = new Date(sub.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

module.exports = {
  SUBSCRIPTION_AMOUNT,
  SUBSCRIPTION_CURRENCY,
  TRIAL_DAYS,
  RENEWAL_PERIOD_DAYS,
  MAX_RENEWAL_ATTEMPTS,
  newTrialSubscription,
  isAccountLocked,
  daysLeftInTrial
};
