import Link from 'next/link';
import { AuthShell } from './AuthShell';
import { ResetPasswordForm } from './PasswordForms';
import { Alert } from '../forms';
import { checkResetToken } from '@/lib/server/auth-actions';

export async function ResetPasswordPage({ token }: { token: string }) {
  const valid = await checkResetToken(token);
  return (
    <AuthShell title="Choose a new password" footer={<Link href="/admin-login" className="font-semibold text-ink hover:underline">Back to sign in</Link>}>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert>This reset link is invalid or has expired.</Alert>
          <Link href="/forgot-password" className="btn btn-dark w-full">Request a new link</Link>
        </div>
      )}
    </AuthShell>
  );
}
