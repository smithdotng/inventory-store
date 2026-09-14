import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/format';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-site px-5 sm:px-8', className)}>{children}</div>;
}

export function Section({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('py-16 sm:py-24', className)} {...rest}>
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'dark' | 'outline';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  dark: 'btn-dark',
  outline: 'btn-outline',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={cn('btn', variantClass[variant], className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  className,
  children,
  href,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; href: string }) {
  return (
    <Link href={href} className={cn('btn', variantClass[variant], className)} {...rest}>
      {children}
    </Link>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-hover',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}
