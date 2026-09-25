import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/PasswordForms';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter the email on your account and we'll send you a reset link." footer={<Link href="/admin-login" className="font-semibold text-ink hover:underline">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
