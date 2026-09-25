'use client';

import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/format';
import { Icon } from './Icon';

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input min-h-[96px] resize-y', props.className)} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={cn('input appearance-none pr-10', props.className)}>
        {children}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
    </span>
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={show ? 'text' : 'password'} className={cn('input pr-16', props.className)} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-subtle hover:text-ink">
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

export function SubmitButton({ children, pendingText, className, name, value, fullWidth = true }: { children: ReactNode; pendingText?: string; className?: string; name?: string; value?: string; fullWidth?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={cn('btn btn-dark', fullWidth && 'btn-lg w-full', className)}>
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> {pendingText || 'Please wait…'}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  if (!children) return null;
  const styles = { error: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success', info: 'bg-brand-soft text-brand-dark' }[kind];
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-xl px-4 py-3 text-sm', styles)}>
      <Icon name={kind === 'success' ? 'check' : 'info'} size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
