import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Badge, ButtonLink, Container, Section } from '@/components/ui';

const FEATURES = [
  {
    title: 'Seamless Inventory Management',
    body: 'Add products with stock, cost and commission. Update levels in real time as you sell, across admin and outlet levels.',
    icon: '📦',
  },
  {
    title: 'Smart Point-of-Sale',
    body: 'Record sales with customer details, accept cash and mobile money, and keep stock perfectly in sync.',
    icon: '🛒',
  },
  {
    title: 'Multi-Outlet & Affiliate Support',
    body: 'Dispense stock to outlets securely, track commissions, and grow with a built-in affiliate programme.',
    icon: '🏪',
  },
  {
    title: 'Automated Financial Tracking',
    body: 'Every sale, payment and commission is recorded automatically so your books are always up to date.',
    icon: '📊',
  },
  {
    title: 'Professional Invoices',
    body: 'Generate clean, branded invoices and receipts in seconds and share them instantly.',
    icon: '🧾',
  },
  {
    title: 'Online Storefront',
    body: 'A functional storefront is created automatically from your inventory — mobile-responsive with secure checkout.',
    icon: '🌐',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'One-Click Registration',
    body: 'Create your Shed in under a minute. No setup fees, no complicated onboarding.',
  },
  {
    n: '02',
    title: 'Step-by-Step Store Configuration',
    body: 'Add your branding, products and payment details with a guided setup.',
  },
  {
    n: '03',
    title: 'Instant Access to Features',
    body: 'Start adding products, record sales immediately and generate invoices in seconds.',
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-surface">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <Container className="relative grid items-center gap-12 py-24 lg:grid-cols-2 lg:py-32">
          <div className="animate-fade-up">
            <Badge>Shed&apos;s integrated e-commerce solution</Badge>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
              Sell anywhere,
              <br />
              manage <span className="text-primary">everything</span>.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-surface/70">
              From inventory and point-of-sale to a ready-made online store — Shed gives your
              business one place to launch, sell and grow.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <ButtonLink href="/admin-register" variant="primary" className="px-8 py-3.5 text-base">
                Create your Shed →
              </ButtonLink>
              <ButtonLink href="/discover" variant="outline" className="border-surface/30 px-8 py-3.5 text-base text-surface hover:border-surface">
                Discover stores
              </ButtonLink>
            </div>
          </div>

          <div className="animate-fade-up rounded-card border border-surface/10 bg-surface/[0.04] p-6 backdrop-blur">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['₦', 'Real-time sales'],
                ['📦', 'Live inventory'],
                ['🧾', 'Instant invoices'],
                ['🌐', 'Online storefront'],
              ].map(([icon, label]) => (
                <div key={label} className="rounded-2xl bg-surface/5 p-5">
                  <div className="text-3xl">{icon}</div>
                  <div className="mt-3 text-sm font-medium text-surface/80">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Features */}
      <Section id="features">
        <Container>
          <div className="max-w-2xl">
            <Badge>Everything you need</Badge>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
              Launch your business with everything in one place
            </h2>
            <p className="mt-4 text-lg text-subtle">
              We&apos;re focused on helping your business sell more and stress less.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-card border border-line bg-surface p-7 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
                  {f.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-subtle">{f.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" className="bg-muted">
        <Container>
          <div className="max-w-2xl">
            <Badge>Effortless setup, instant results</Badge>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Up and running in three steps</h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-card bg-surface p-8 shadow-card">
                <span className="text-5xl font-extrabold text-primary/30">{s.n}</span>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-subtle">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="bg-ink text-surface">
        <Container>
          <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary to-primary-hover px-8 py-16 text-center text-ink sm:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold sm:text-4xl">
              Ready to organize your business, like a well-stocked shed?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-ink/80">
              Join and start selling with a free Shed today. No card required.
            </p>
            <ButtonLink href="/admin-register" variant="dark" className="mt-8 px-10 py-4 text-base">
              Create your Shed →
            </ButtonLink>
          </div>
        </Container>
      </Section>

      <SiteFooter />
    </>
  );
}
