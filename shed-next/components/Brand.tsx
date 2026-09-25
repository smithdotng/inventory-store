import Link from 'next/link';
import { cn } from '@/lib/format';

/**
 * The Shed logo (mark + wordmark). `tone="light"` is the white-wordmark version
 * for dark backgrounds. Height is set by `className` (defaults to h-8).
 */
export function BrandLogo({ tone = 'dark', className, href = '/', priority }: { tone?: 'dark' | 'light'; className?: string; href?: string | null; priority?: boolean }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === 'light' ? '/brand/shed-logo-light.png' : '/brand/shed-logo.png'}
      alt="Shed"
      width={721}
      height={223}
      className={cn('block h-8 w-auto select-none', className)}
      draggable={false}
      fetchPriority={priority ? 'high' : undefined}
    />
  );
  if (!href) return img;
  return (
    <Link href={href} aria-label="Shed home" className="flex shrink-0 items-center">
      {img}
    </Link>
  );
}
