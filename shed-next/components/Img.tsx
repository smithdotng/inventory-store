'use client';

import { useState } from 'react';
import { cn, initials } from '@/lib/format';
import { Icon } from './Icon';

/** <img> with graceful fallback for missing/broken seller uploads. */
export function Img({
  src,
  alt,
  className,
  fallback = 'product',
  loading = 'lazy',
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: 'product' | 'store';
  loading?: 'lazy' | 'eager';
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-canvas text-subtle/60', className)} aria-label={alt} role="img">
        {fallback === 'store' ? <span className="text-sm font-bold text-brand-dark">{initials(alt)}</span> : <Icon name="box" size={32} strokeWidth={1.25} />}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailed(true)} className={cn('h-full w-full object-cover', className)} />;
}
