import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-surface lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <Link href="/" className="relative text-2xl font-extrabold">
          Shed<span className="text-primary">.</span>
        </Link>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">
            Manage your
            <br />
            business <span className="text-primary">everywhere</span>.
          </h1>
          <p className="mt-4 max-w-sm text-surface/70">
            Inventory, sales, invoices and your online store — all in one dashboard.
          </p>
        </div>
        <span className="relative text-sm text-surface/40">© {new Date().getFullYear()} Shed</span>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block text-2xl font-extrabold lg:hidden">
            Shed<span className="text-primary">.</span>
          </Link>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-subtle">Sign in to your dashboard.</p>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-subtle">
            Don&apos;t have an account?{' '}
            <a href="/admin-register" className="font-semibold text-primary-hover hover:underline">
              Create your Shed
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
