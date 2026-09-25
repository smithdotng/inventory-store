'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Progressive Web App glue:
 *  - registers /sw.js (production only)
 *  - captures the browser's install prompt so we can offer "Install Shed" ourselves
 *  - notices when a new version has downloaded and lets the user switch to it
 */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

interface Pwa {
  /** Chrome/Edge/Android: the browser will show its install dialog. */
  canInstall: boolean;
  /** iPhone/iPad Safari: no install dialog exists — show "Add to Home Screen" steps instead. */
  iosInstallable: boolean;
  /** Running as the installed app. */
  standalone: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  updateReady: boolean;
  applyUpdate: () => void;
}

const Ctx = createContext<Pwa>({ canInstall: false, iosInstallable: false, standalone: false, install: async () => 'unavailable', updateReady: false, applyUpdate: () => {} });
export const usePwa = () => useContext(Ctx);

export function PwaProvider({ children }: { children: ReactNode }) {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const updateRequested = useRef(false);
  const [canInstall, setCanInstall] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [iosInstallable, setIosInstallable] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const isStandalone = () => mq.matches || (navigator as any).standalone === true;
    setStandalone(isStandalone());
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    setIosInstallable(ios && safari && !isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own button
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setCanInstall(false);
      setStandalone(true);
    };
    const onMode = () => setStandalone(isStandalone());
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    mq.addEventListener?.('change', onMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      mq.removeEventListener?.('change', onMode);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      // Reload only when the user asked for the update — not when the very first
      // worker takes control of a fresh visit.
      if (reloading || !updateRequested.current) return;
      reloading = true;
      window.location.reload();
    };
    let lastCheck = Date.now();
    let reg: ServiceWorkerRegistration | undefined;
    const onVisible = () => {
      // Look for a new version when the app comes back to the foreground (at most every 30 min).
      if (document.visibilityState === 'visible' && reg && Date.now() - lastCheck > 30 * 60 * 1000) {
        lastCheck = Date.now();
        reg.update().catch(() => {});
      }
    };

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((r) => {
        reg = r;
        // Only offer an update when an older version is already in control of this page.
        if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
        r.addEventListener('updatefound', () => {
          const sw = r.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const install = useCallback(async () => {
    const e = deferred.current;
    if (!e) return 'unavailable' as const;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred.current = null;
    setCanInstall(false);
    return outcome;
  }, []);

  const applyUpdate = useCallback(() => {
    updateRequested.current = true;
    if (waiting) waiting.postMessage('SKIP_WAITING');
    else window.location.reload();
  }, [waiting]);

  return (
    <Ctx.Provider value={{ canInstall, iosInstallable, standalone, install, updateReady: !!waiting, applyUpdate }}>
      {children}
    </Ctx.Provider>
  );
}
