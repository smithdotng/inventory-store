/**
 * Daily subscription sweep at 03:00 server time — the job the old Express app
 * ran with node-cron. Disabled with INTERNAL_CRON=off, and on Vercel (which
 * calls /api/cron/subscriptions from vercel.json instead).
 */
import { runSubscriptionSweep } from './lib/server/jobs/subscriptions';

const g = globalThis as unknown as { __shedCron?: boolean };

if (process.env.INTERNAL_CRON !== 'off' && !process.env.VERCEL && !g.__shedCron) {
  g.__shedCron = true;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(async () => {
      try {
        console.log('[cron] subscription sweep', await runSubscriptionSweep());
      } catch (e: any) {
        console.error('[cron] subscription sweep failed:', e?.message);
      }
      schedule();
    }, next.getTime() - now.getTime());
  };
  schedule();
}
