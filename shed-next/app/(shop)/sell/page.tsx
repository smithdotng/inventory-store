import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { Container } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { SUBSCRIPTION_AMOUNT, TRIAL_DAYS } from '@/lib/server/subscription';

export const metadata = pageMeta({ title: 'Sell on Shed', description: 'Inventory, point of sale, invoices and a free online store for your business — in one simple app.', path: '/sell' });

const FEATURES = [
  { icon: 'box', title: 'Inventory that keeps up', body: 'Add products with photos and prices. Stock updates by itself every time you sell — in store, online or at an outlet.' },
  { icon: 'cart', title: 'Point of sale', body: 'Ring up sales on any phone, tablet or laptop. Cash, transfer, POS or mobile money — with receipts by email or WhatsApp.' },
  { icon: 'receipt', title: 'Professional invoices', body: 'Branded invoices and receipts in seconds, with your bank details. Mark them paid and see who still owes you.' },
  { icon: 'globe', title: 'Your own online store', body: 'Every product appears on your free Shed store and the Shed marketplace. Share one link on WhatsApp and Instagram.' },
  { icon: 'store', title: 'Outlets & commission', body: 'Send stock to kiosks, agents or branches. They sell from their own login and Shed tracks the commission you owe.' },
  { icon: 'user', title: 'Your team, your rules', body: 'Give cashiers and stock clerks their own sign-in with only the access they need.' },
];

const FAQ = [
  ['Do I need a card to start?', `No. Your first ${TRIAL_DAYS} days are free. You only add a card if you decide to keep going.`],
  ['How do customers pay me?', 'Online customers can pay you directly using your payment instructions, or pay online by card and transfer. At the counter you record cash, transfer, POS or mobile money.'],
  ['Can I use it on my phone?', 'Yes — Shed works in any browser on phones, tablets and computers. You can add it to your home screen like an app.'],
  ['What happens to my data if I stop?', 'Your products, customers and sales stay safe. Your store is simply paused until you subscribe again.'],
];

export default function SellPage() {
  const price = `₦${SUBSCRIPTION_AMOUNT.toLocaleString()}`;
  return (
    <>
      <section className="bg-ink text-white">
        <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand">For shops, traders & growing brands</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] sm:text-6xl">Sell anywhere.<br />Manage <span className="text-brand">everything.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">Shed puts your stock, sales, invoices and online store in one simple app — so you spend less time on books and more time selling.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/admin-register" className="btn btn-brand btn-lg">Start free for {TRIAL_DAYS} days <Icon name="arrowRight" size={18} /></Link>
              <Link href="/admin-login" className="btn btn-lg border border-white/25 text-white hover:border-white">Sign in</Link>
            </div>
            <p className="mt-4 text-sm text-white/50">No card needed · Then {price}/month · Cancel anytime</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['Sales today', '₦245,500'], ['Low on stock', '3 items'], ['Unpaid invoices', '₦80,000'], ['Online orders', '12 this week']].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10">
                <p className="text-sm text-white/60">{k}</p>
                <p className="mt-2 text-2xl font-extrabold">{v}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-16 sm:py-20">
        <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">Everything you need to run the shop</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-dark"><Icon name={f.icon} size={22} /></span>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-subtle">{f.body}</p>
            </div>
          ))}
        </div>
      </Container>

      <section className="border-y border-line bg-surface">
        <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold sm:text-4xl">Up and running in minutes</h2>
            <ol className="mt-8 space-y-6">
              {[['Create your store', 'Sign up with your business name and email.'], ['Add your products', 'Snap photos, set prices and stock.'], ['Start selling', 'Use the point of sale, send invoices and share your store link.']].map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-bold text-white">{i + 1}</span>
                  <span><span className="block font-bold">{t}</span><span className="text-subtle">{b}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card self-start p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-subtle">One simple plan</p>
            <p className="mt-3 text-5xl font-extrabold">{price}<span className="text-lg font-medium text-subtle">/month</span></p>
            <p className="mt-2 text-subtle">after your {TRIAL_DAYS}-day free trial</p>
            <ul className="mt-6 space-y-2 text-sm">
              {['Unlimited products, sales and invoices', 'Online store + marketplace listing', 'Team logins and outlets', 'Email & WhatsApp receipts'].map((x) => <li key={x} className="flex items-center gap-2"><Icon name="check" size={16} className="text-success" /> {x}</li>)}
            </ul>
            <Link href="/admin-register" className="btn btn-brand btn-lg mt-8 w-full">Create my store</Link>
          </div>
        </Container>
      </section>

      <Container className="py-16 sm:py-20">
        <h2 className="text-3xl font-extrabold">Questions</h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{q}<Icon name="chevronDown" size={18} className="shrink-0 transition group-open:rotate-180" /></summary>
              <p className="mt-3 text-subtle">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-subtle">Still unsure? <Link href="/contact" className="font-semibold text-ink underline">Talk to us</Link> or <Link href="/referrals/signup" className="font-semibold text-ink underline">become an affiliate</Link>.</p>
      </Container>
    </>
  );
}
