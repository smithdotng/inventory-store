import { redirect } from 'next/navigation';
import { affiliateStats, currentAffiliate, referralLink } from '@/lib/server/public/affiliates';
import { Container } from '@/components/ui';
import { ShareStore } from '@/components/dashboard/ShareStore';

export const metadata = { title: 'Affiliate dashboard' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const a = await currentAffiliate();
  if (!a) redirect('/referrals/login');
  const { activities, clicks, signups } = await affiliateStats(a._id);
  const link = referralLink(a.referralCode || String(a._id));
  const rate = clicks ? Math.round((signups / clicks) * 100) : 0;
  return (
    <Container className="py-8 sm:py-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Hi {a.firstName}</h1>
          <p className="text-subtle">Your Shed affiliate dashboard.</p>
        </div>
        <a href="/referrals/logout" className="btn btn-outline">Sign out</a>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-5"><p className="text-sm text-subtle">Link clicks</p><p className="text-3xl font-extrabold">{clicks}</p></div>
        <div className="card p-5"><p className="text-sm text-subtle">Store signups</p><p className="text-3xl font-extrabold">{signups}</p></div>
        <div className="card p-5"><p className="text-sm text-subtle">Conversion</p><p className="text-3xl font-extrabold">{rate}%</p></div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card p-5">
          <h2 className="mb-1 font-bold">Your referral link</h2>
          <p className="mb-4 text-sm text-subtle">Share it with business owners. When they sign up through it, it counts for you.</p>
          <ShareStore url={link} businessName="Shed" text="Run your business on Shed — inventory, POS, invoices and a free online store:" />
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-bold">Recent activity</h2>
          {activities.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-subtle">No activity yet — share your link to get started.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {activities.map((x: any) => (
                <li key={x._id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{x.action === 'New Admin Signup' ? `New store signup${x.userEmail ? ` (${x.userEmail.replace(/(.{2}).+(@.+)/, '$1…$2')})` : ''}` : 'Link clicked'}</span>
                  <span className="text-subtle">{new Date(x.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
