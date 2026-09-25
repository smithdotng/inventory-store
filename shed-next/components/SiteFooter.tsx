import Link from 'next/link';
import { BrandLogo } from './Brand';
import { Container } from './ui';
import { Icon } from './Icon';

const COLS = [
  { title: 'Shop', links: [['All products', '/search'], ['Categories', '/categories'], ['Stores', '/search?type=stores'], ['Market clusters', '/clusters']] },
  { title: 'Your account', links: [['Sign in', '/shopper/login'], ['Create account', '/shopper/register'], ['My orders', '/shopper/account']] },
  { title: 'Sell on Shed', links: [['Why Shed', '/sell'], ['Open a store', '/admin-register'], ['Seller login', '/admin-login'], ['Outlet login', '/outlet-login'], ['Affiliates', '/referrals/signup']] },
  { title: 'Company', links: [['Blog', '/blog'], ['Contact', '/contact']] },
];

export function TrustStrip() {
  const items = [
    { icon: 'shield', title: 'Verified sellers', body: 'Real businesses running on Shed' },
    { icon: 'receipt', title: 'Instant invoice', body: 'PDF receipt emailed for every order' },
    { icon: 'chat', title: 'Talk to the seller', body: 'Chat on WhatsApp before you pay' },
    { icon: 'truck', title: 'Local delivery', body: 'Arrange pickup or delivery directly' },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.title} className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <Icon name={i.icon} size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold">{i.title}</p>
            <p className="text-xs text-subtle">{i.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-ink pb-20 text-white md:pb-0">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <BrandLogo tone="light" className="h-9" />
          <p className="mt-3 max-w-xs text-sm text-white/60">Shop from local businesses you can trust. Every store on Shed runs its inventory, invoices and orders in one place.</p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">{c.title}</h4>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  {/^\/(search|categories|shopper|admin-|store|sell|clusters|blog|contact|referrals|outlet-login)/.test(href) ? (
                    <Link href={href} className="text-sm text-white/75 hover:text-brand">{label}</Link>
                  ) : (
                    // Served by the Express app — full page load.
                    <a href={href} className="text-sm text-white/75 hover:text-brand">{label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col items-center justify-between gap-2 py-5 text-xs text-white/50 sm:flex-row">
          <span>© {new Date().getFullYear()} Shed. All rights reserved.</span>
          <a href="mailto:support@shed.ng" className="hover:text-white">support@shed.ng</a>
        </Container>
      </div>
    </footer>
  );
}
