'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* dismissed */
    }
  };
  return (
    <button onClick={share} className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle hover:text-ink">
      <Icon name={copied ? 'check' : 'share'} size={16} /> {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
