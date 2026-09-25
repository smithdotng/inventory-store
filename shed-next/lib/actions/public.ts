'use server';

import { redirect } from 'next/navigation';
import * as outlets from '@/lib/server/seller/outlets';
import * as aff from '@/lib/server/public/affiliates';
import { submitContact } from '@/lib/server/public/content';

export type PublicForm = { error?: string | null; message?: string | null; values?: Record<string, string>; id?: string; at?: number };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

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

/* Outlet portal */
export async function outletLoginAction(_: PublicForm, fd: FormData): Promise<PublicForm> {
  const err = await attempt(() => outlets.outletSignIn(s(fd, 'usernameOrEmail'), String(fd.get('password') ?? '')));
  if (err) return { error: err, values: { usernameOrEmail: s(fd, 'usernameOrEmail') } };
  redirect('/outlet-portal');
}

export async function outletSaleAction(input: { lines: { itemId: string; quantity: number }[]; customer: { name: string; phone: string; email: string }; paymentMethod: string }): Promise<PublicForm> {
  let id = '';
  const err = await attempt(async () => {
    id = await outlets.outletSale(input.lines, input.customer, input.paymentMethod);
  });
  return err ? { error: err, at: Date.now() } : { message: 'Sale recorded.', id, at: Date.now() };
}

/* Affiliates */
export async function affiliateSignupAction(_: PublicForm, fd: FormData): Promise<PublicForm> {
  const values = { firstName: s(fd, 'firstName'), lastName: s(fd, 'lastName'), email: s(fd, 'email'), country: s(fd, 'country'), countryCode: s(fd, 'countryCode'), mobileNumber: s(fd, 'mobileNumber') };
  const err = await attempt(() => aff.affiliateSignup({ ...values, password: String(fd.get('password') ?? '') }));
  if (err) return { error: err, values };
  redirect('/referrals/dashboard');
}

export async function affiliateLoginAction(_: PublicForm, fd: FormData): Promise<PublicForm> {
  const err = await attempt(() => aff.affiliateLogin(s(fd, 'email'), String(fd.get('password') ?? '')));
  if (err) return { error: err, values: { email: s(fd, 'email') } };
  redirect('/referrals/dashboard');
}

export async function affiliateForgotAction(_: PublicForm, fd: FormData): Promise<PublicForm> {
  await aff.affiliateForgot(s(fd, 'email'));
  return { message: 'If that email is registered, a reset link is on its way.' };
}

export async function affiliateResetAction(_: PublicForm, fd: FormData): Promise<PublicForm> {
  const err = await attempt(() => aff.affiliateReset(s(fd, 'token'), String(fd.get('password') ?? ''), String(fd.get('confirmPassword') ?? '')));
  if (err) return { error: err };
  redirect('/referrals/login?message=' + encodeURIComponent('Password reset. Please sign in.'));
}

/* Contact */
export async function contactAction(_: PublicForm, fd: FormData): Promise<PublicForm> {
  const values = { name: s(fd, 'name'), email: s(fd, 'email'), phone: s(fd, 'phone'), subject: s(fd, 'subject'), message: s(fd, 'message') };
  const err = await attempt(() => submitContact(values));
  return err ? { error: err, values } : { message: "Thanks — your message is on its way. We'll reply by email." };
}
