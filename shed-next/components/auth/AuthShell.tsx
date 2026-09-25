import Link from 'next/link';
import { BrandLogo } from '../Brand';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';

const POINTS = [
  { icon: 'box', text: 'Track stock across your store and outlets' },
  { icon: 'receipt', text: 'Sell at the counter and send invoices in seconds' },
  { icon: 'store', text: 'Get a free online store your customers can order from' },
];

/** Split-screen layout for sign-in / sign-up pages. */
export function AuthShell({ title, subtitle, children, footer, wide = false }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/25 blur-3xl" />
        <div className="relative"><BrandLogo tone="light" className="h-11" /></div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">Run your whole business from one place.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-white/80">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand">
                  <Icon name={p.icon} size={20} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">© {new Date().getFullYear()} Shed · shed.ng</p>
      </aside>

      <main className="flex flex-col bg-surface px-5 py-8 sm:px-10">
        <div className="lg:hidden"><BrandLogo className="h-8" /></div>
        <div className={`m-auto w-full ${wide ? 'max-w-xl' : 'max-w-md'} py-10`}>
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-subtle">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-subtle">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
