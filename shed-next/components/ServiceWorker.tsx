'use client';

import { useEffect } from 'react';

/** Registers /sw.js in production (replaces the old Workbox worker on returning devices). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
