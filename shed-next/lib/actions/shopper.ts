'use server';

import { redirect } from 'next/navigation';
import * as acct from '@/lib/server/shopper/account';

export type ShopperForm = { error?: string | null; message?: string | null; step?: 'email' | 'code'; email?: string; values?: Record<string, string> };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/shopper/account');

async function attempt(fn: () => Promise<void>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e: any) {
    if (typeof e?.status === 'number') return e.message;
    console.error(e);
    return 'Something went wrong. Please try again.';
  }
}

export async function shopperLoginAction(_: ShopperForm, fd: FormData): Promise<ShopperForm> {
  const err = await attempt(() => acct.passwordSignIn(s(fd, 'email'), String(fd.get('password') ?? '')));
  if (err) return { error: err, values: { email: s(fd, 'email') } };
  redirect(safeNext(s(fd, 'next')));
}

export async function shopperCodeAction(prev: ShopperForm, fd: FormData): Promise<ShopperForm> {
  const email = s(fd, 'email');
  if (fd.get('intent') === 'send') {
    const err = await attempt(() => acct.sendSignInCode(email));
    return err ? { error: err, step: 'email', email } : { step: 'code', email, message: `We sent a 6-digit code to ${email}.` };
  }
  const err = await attempt(() => acct.codeSignIn(email, s(fd, 'otp')));
  if (err) return { error: err, step: 'code', email };
  redirect(safeNext(s(fd, 'next')));
}

export async function shopperRegisterAction(_: ShopperForm, fd: FormData): Promise<ShopperForm> {
  const values = { firstName: s(fd, 'firstName'), lastName: s(fd, 'lastName'), email: s(fd, 'email'), phone: s(fd, 'phone') };
  let email = '';
  const err = await attempt(async () => {
    email = await acct.startShopperRegistration({ ...values, password: String(fd.get('password') ?? ''), confirmPassword: String(fd.get('confirmPassword') ?? '') });
  });
  if (err) return { error: err, values };
  redirect(`/shopper/verify-email?email=${encodeURIComponent(email)}${s(fd, 'next') ? `&next=${encodeURIComponent(s(fd, 'next'))}` : ''}`);
}

export async function shopperVerifyAction(_: ShopperForm, fd: FormData): Promise<ShopperForm> {
  const email = s(fd, 'email');
  if (fd.get('intent') === 'resend') {
    const err = await attempt(() => acct.resendShopperCode(email));
    return err ? { error: err } : { message: 'A new code has been sent to your email.' };
  }
  const err = await attempt(() => acct.completeShopperRegistration(email, s(fd, 'otp')));
  if (err) return { error: err };
  redirect(safeNext(s(fd, 'next')));
}

export async function shopperProfileAction(_: ShopperForm, fd: FormData): Promise<ShopperForm> {
  const me = await acct.currentShopper();
  if (!me) redirect('/shopper/login');
  const err = await attempt(() => acct.updateShopperProfile(me, { firstName: s(fd, 'firstName'), lastName: s(fd, 'lastName'), phone: s(fd, 'phone') }));
  return err ? { error: err } : { message: 'Profile saved.' };
}
