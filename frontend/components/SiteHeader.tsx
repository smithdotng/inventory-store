'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Container } from './ui';

const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Discover', href: '/discover' },
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight">
            Shed<span className="text-primary">.</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-ink/70 transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href="/admin-login" className="text-sm font-medium text-ink/70 hover:text-ink">
            Sign in
          </a>
          <a href="/admin-register" className="btn btn-dark px-5 py-2.5 text-sm">
            Create your Shed
          </a>
        </div>

        <button
          aria-label="Toggle menu"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </Container>

      {open && (
        <div className="border-t border-line bg-surface md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm font-medium text-ink/80 hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
            <a href="/admin-login" className="rounded-lg px-2 py-2 text-sm font-medium text-ink/80 hover:bg-muted">
              Sign in
            </a>
            <a href="/admin-register" className="btn btn-dark mt-2 text-sm">
              Create your Shed
            </a>
          </Container>
        </div>
      )}
    </header>
  );
}
