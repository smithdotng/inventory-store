import 'server-only';

// Port of utils/subscription.js
export const SUBSCRIPTION_AMOUNT = Number(process.env.SUBSCRIPTION_AMOUNT || 7200);
export const SUBSCRIPTION_CURRENCY = process.env.FLW_CURRENCY || 'NGN';
export const TRIAL_DAYS = 14;
export const RENEWAL_PERIOD_DAYS = 30;
export const MAX_RENEWAL_ATTEMPTS = 5;

export function newTrialSubscription() {
  return {
    status: 'trial',
    plan: 'storeowner_monthly',
    amount: SUBSCRIPTION_AMOUNT,
    currency: SUBSCRIPTION_CURRENCY,
    legacyAccount: false,
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    trialReminderSentAt: null,
    currentPeriodEnd: null,
    card: null,
    failedAttempts: 0,
    lastChargeAt: null,
    lastChargeStatus: null,
  };
}

/** Locked = trial/subscription lapsed. Legacy/untracked/comped/active accounts are never locked. */
export function isAccountLocked(admin: any): boolean {
  if (!admin) return false;
  const sub = admin.subscription;
  if (!sub) return false;
  if (sub.legacyAccount) return false;
  if (sub.status === 'active' || sub.status === 'comped') return false;
  if (sub.status === 'trial') return Boolean(sub.trialEndsAt) && new Date(sub.trialEndsAt) < new Date();
  return true;
}

export function daysLeftInTrial(admin: any): number {
  const sub = admin?.subscription;
  if (!sub || sub.status !== 'trial' || !sub.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000));
}

/** Same rule as isAccountLocked, as a Mongo filter on a joined `store` (admins) doc. */
export function storeOpenFilter(prefix = 'store.') {
  const now = new Date();
  return {
    $or: [
      { [`${prefix}subscription`]: { $exists: false } },
      { [`${prefix}subscription`]: null },
      { [`${prefix}subscription.legacyAccount`]: true },
      { [`${prefix}subscription.status`]: { $in: ['active', 'comped'] } },
      { [`${prefix}subscription.status`]: 'trial', [`${prefix}subscription.trialEndsAt`]: { $in: [null] } },
      { [`${prefix}subscription.status`]: 'trial', [`${prefix}subscription.trialEndsAt`]: { $gte: now } },
    ],
  };
}
