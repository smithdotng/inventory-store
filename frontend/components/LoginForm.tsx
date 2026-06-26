'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState({ usernameOrEmail: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid username/email or password');
        setSubmitting(false);
        return;
      }
      // Cookie is now set (same origin via proxy). Navigate to the dashboard.
      router.push(data.redirect || '/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink/80">Username or email</span>
        <input
          autoFocus
          value={form.usernameOrEmail}
          onChange={(e) => setForm((f) => ({ ...f, usernameOrEmail: e.target.value }))}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink/80">Password</span>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
          required
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={submitting} className="btn btn-primary w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center text-sm">
        <a href="/forgot-password" className="text-subtle hover:text-ink">
          Forgot password?
        </a>
      </p>
    </form>
  );
}
