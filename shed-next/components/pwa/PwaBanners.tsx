'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';
import { usePwa } from './PwaProvider';

const DISMISS_KEY = 'shed-install-dismissed';
const DISMISS_DAYS = 14;
const VIEWS_KEY = 'shed-page-views';

const store = {
  get(k: string, session = false) {
    try {
      return (session ? sessionStorage : localStorage).getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string, session = false) {
    try {
      (session ? sessionStorage : localStorage).setItem(k, v);
    } catch {
      /* private mode etc. */
    }
  },
};

/** Pages where an install suggestion is welcome (not mid-checkout, not on the POS). */
function promptablePath(p: string) {
  if (['/', '/search', '/categories', '/clusters', '/dashboard'].includes(p)) return true;
  return /^\/store\/[^/]+\/?$/.test(p);
}

/** iOS Safari "Share" glyph. */
function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" className="mx-0.5 inline -translate-y-0.5">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

export function IosInstallSteps({ className }: { className?: string }) {
  return (
    <ol className={cn('space-y-1.5 text-sm text-subtle', className)}>
      <li>
        1. Tap <ShareGlyph /> <strong className="text-ink">Share</strong> in Safari's toolbar
      </li>
      <li>
        2. Choose <strong className="text-ink">Add to Home Screen</strong>
      </li>
      <li>
        3. Tap <strong className="text-ink">Add</strong>
      </li>
    </ol>
  );
}

/** Friendly "Install Shed" card, shown once people have looked around a little. */
export function InstallPrompt() {
  const { canInstall, iosInstallable, standalone, install } = usePwa();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const views = Number(store.get(VIEWS_KEY, true) || 0) + 1;
    store.set(VIEWS_KEY, String(views), true);
    if (views >= 2) setReady(true);
    const t = setTimeout(() => setReady(true), 20000);
    return () => clearTimeout(t);
  }, [path]);

  useEffect(() => {
    const dismissed = Number(store.get(DISMISS_KEY) || 0);
    const snoozed = Date.now() - dismissed < DISMISS_DAYS * 864e5;
    setOpen(ready && !standalone && !snoozed && (canInstall || iosInstallable) && promptablePath(path));
  }, [ready, standalone, canInstall, iosInstallable, path]);

  if (!open) return null;

  const dismiss = () => {
    store.set(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };
  const onShop = !path.startsWith('/dashboard');

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      className={cn(
        'fixed inset-x-3 z-[60] mx-auto max-w-md animate-[slideUp_.25s_ease-out] rounded-2xl border border-line bg-surface p-4 shadow-lift sm:inset-x-auto sm:right-6 sm:w-[380px]',
        onShop ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-6' : 'bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-6',
      )}
    >
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/android-chrome-192x192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="pwa-install-title" className="font-bold">Install the Shed app</p>
          <p className="mt-0.5 text-sm text-subtle">
            {onShop ? 'Open Shed from your home screen, like any other app — faster, and your cart is always there.' : 'Open your store from your home screen and sell with one tap — works full-screen, like an app.'}
          </p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-canvas">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {showIos ? (
        <IosInstallSteps className="mt-3 rounded-xl bg-canvas p-3" />
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={dismiss} className="btn btn-outline h-11 min-h-0 flex-1">Not now</button>
          <button
            onClick={async () => {
              if (canInstall) {
                const r = await install();
                if (r !== 'accepted') dismiss();
                else setOpen(false);
              } else setShowIos(true);
            }}
            className="btn btn-dark h-11 min-h-0 flex-1"
          >
            Install
          </button>
        </div>
      )}
    </div>
  );
}

/** Shown when a new version of the app has downloaded. */
export function UpdateBanner() {
  const { updateReady, applyUpdate } = usePwa();
  const [hidden, setHidden] = useState(false);
  if (!updateReady || hidden) return null;
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-lift sm:inset-x-auto sm:right-6 sm:top-6">
      <span className="flex-1 text-sm">A new version of Shed is ready.</span>
      <button onClick={() => setHidden(true)} className="text-sm text-white/60 hover:text-white">Later</button>
      <button onClick={applyUpdate} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-ink">Update</button>
    </div>
  );
}

/** "Install app" row for account menus. Hidden when already installed or not installable. */
export function InstallAppItem({ className }: { className?: string }) {
  const { canInstall, iosInstallable, standalone, install } = usePwa();
  const [steps, setSteps] = useState(false);
  if (standalone || (!canInstall && !iosInstallable)) return null;
  return (
    <div>
      <button type="button" role="menuitem" onClick={() => (canInstall ? install() : setSteps((s) => !s))} className={cn('w-full text-left', className)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M12 7v7" /><path d="M9 11l3 3 3-3" /></svg>
        Install the app
      </button>
      {steps && <IosInstallSteps className="mx-4 mb-2 rounded-xl bg-canvas p-3" />}
    </div>
  );
}
