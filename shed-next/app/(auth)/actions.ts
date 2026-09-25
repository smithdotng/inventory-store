'use server';

import { redirect } from 'next/navigation';
import {
  completeRegistration,
  requestPasswordReset,
  resendRegistrationCode,
  resetPassword,
  signIn,
  startRegistration,
} from '@/lib/server/auth-actions';
import { saveUpload, UploadError } from '@/lib/server/uploads';

export type FormState = { error?: string | null; message?: string | null; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await signIn(str(fd, 'usernameOrEmail'), String(fd.get('password') ?? ''));
  if (!r.ok) return { error: r.error, values: { usernameOrEmail: str(fd, 'usernameOrEmail') } };
  const next = str(fd, 'next');
  redirect(next.startsWith('/dashboard') ? next : r.redirect);
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = Object.fromEntries(
    ['businessName', 'email', 'currency', 'username', 'country', 'firstName', 'lastName', 'category', 'clusterId'].map((k) => [k, str(fd, k)]),
  );
  let logo: string | null = null;
  try {
    logo = await saveUpload(fd.get('logo') as File | null, 'logo', values.username);
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message, values };
    throw e;
  }
  const r = await startRegistration({ ...(values as any), password: String(fd.get('password') ?? ''), referralCode: str(fd, 'ref') || null, logo });
  if (!r.ok) return { error: r.error, values };
  redirect(`/verify-email?email=${encodeURIComponent(r.email)}`);
}

export async function verifyEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email');
  if (fd.get('intent') === 'resend') {
    const r = await resendRegistrationCode(email);
    return r.ok ? { message: 'A new code has been sent to your email.' } : { error: r.error };
  }
  const r = await completeRegistration(email, str(fd, 'otp'));
  if (!r.ok) return { error: r.error };
  redirect('/admin-login?message=' + encodeURIComponent('Account created! Please log in.'));
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requestPasswordReset(str(fd, 'email'));
  return { message: 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam).' };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await resetPassword(str(fd, 'token'), String(fd.get('password') ?? ''), String(fd.get('confirmPassword') ?? ''));
  if (!r.ok) return { error: r.error };
  redirect('/admin-login?message=' + encodeURIComponent('Password reset successfully. Please log in.'));
}

export async function setupAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { acceptInvitation } = await import('@/lib/server/seller/account');
  try {
    await acceptInvitation(str(fd, 'token'), String(fd.get('password') ?? ''), String(fd.get('confirmPassword') ?? ''));
  } catch (e: any) {
    return { error: e?.message || 'Could not set up your account.' };
  }
  redirect('/admin-login?message=' + encodeURIComponent('Your account is ready. Sign in with your email and new password.'));
}
