'use client';

import { useState } from 'react';
import { Icon, WhatsAppIcon } from '../Icon';

export function ShareStore({ url, businessName, text }: { url: string; businessName: string; text?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
        <Icon name="globe" size={16} className="shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}
          className="btn btn-outline h-10 min-h-0 px-2 text-xs"
        >
          <Icon name={copied ? 'check' : 'share'} size={15} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text ? `${text} ${url}` : `Shop ${businessName} online: ${url}`)}`} target="_blank" rel="noreferrer" className="btn h-10 min-h-0 bg-[#25D366] px-2 text-xs text-white hover:bg-[#1ebe5b]">
          <WhatsAppIcon size={15} /> Share
        </a>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-dark h-10 min-h-0 px-2 text-xs">
          Open
        </a>
      </div>
    </div>
  );
}
