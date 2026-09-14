import Link from 'next/link';
import { Container } from './ui';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink text-surface">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-2xl font-extrabold">
            Shed<span className="text-primary">.</span>
          </span>
          <p className="mt-3 max-w-xs text-sm text-surface/60">
            Sell anywhere, manage everything. Organize your business, like a well-stocked shed.
          </p>
        </div>

        <FooterCol
          title="Product"
          links={[
            { label: 'Discover stores', href: '/discover' },
            { label: 'Features', href: '/#features' },
            { label: 'How it works', href: '/#how-it-works' },
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            { label: 'Sign in', href: '/admin-login' },
            { label: 'Create your Shed', href: '/admin-register' },
            { label: 'Affiliates', href: '/referrals/login' },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { label: 'Home', href: '/' },
            { label: 'Support', href: 'mailto:support@shed.ng' },
          ]}
        />
      </Container>
      <div className="border-t border-surface/10">
        <Container className="flex flex-col items-center justify-between gap-2 py-6 text-xs text-surface/50 sm:flex-row">
          <span>© {new Date().getFullYear()} Shed. All rights reserved.</span>
          <span>Built for businesses that move.</span>
        </Container>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-surface/40">{title}</h4>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-sm text-surface/70 transition-colors hover:text-primary">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
