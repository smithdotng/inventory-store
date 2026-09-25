import 'server-only';
import { redirect } from 'next/navigation';
import { getDb, oid } from './db';
import { getSession, type SessionData } from './session';
import { isAccountLocked } from './subscription';

export type Role = 'superadmin' | 'admin' | 'cashier' | 'stock_clerk' | string;

export interface SellerContext {
  session: SessionData;
  /** The signed-in account (admins doc or business_users doc). */
  user: any;
  userType: 'admin' | 'business_user';
  role: Role;
  /** The store owner's admins document (the business). */
  admin: any;
  locked: boolean;
  displayName: string;
}

/** Where each role lands after sign-in (port of utils/helpers.getDashboardUrl). */
export function dashboardUrl(role?: string) {
  if (role === 'cashier') return '/dashboard/pos';
  if (role === 'stock_clerk') return '/dashboard/inventory';
  if (role === 'superadmin') return '/dashboard/admin';
  return '/dashboard';
}

/**
 * Resolve the signed-in seller (admin owner or team member). Port of the
 * Express setupSessionValidation middleware. Returns null when not signed in
 * or the account no longer exists / is inactive.
 */
export async function getSeller(): Promise<SellerContext | null> {
  const session = await getSession();
  if (!session || (!session.admin && !session.userId)) return null;
  const db = await getDb();

  if (session.admin) {
    const admin = await db.collection('admins').findOne({ username: session.admin });
    if (!admin) return null;
    return {
      session,
      user: admin,
      userType: 'admin',
      role: admin.role || 'admin',
      admin,
      locked: admin.role !== 'superadmin' && isAccountLocked(admin),
      displayName: admin.firstName || admin.username,
    };
  }

  const userId = oid(session.userId);
  if (!userId) return null;
  const user = await db.collection('business_users').findOne({ _id: userId });
  if (!user || user.status !== 'active') return null;
  const admin = user.adminId ? await db.collection('admins').findOne({ _id: oid(user.adminId)! }) : null;
  if (!admin) return null;
  return {
    session,
    user,
    userType: 'business_user',
    role: user.role,
    admin,
    locked: isAccountLocked(admin),
    displayName: user.firstName || user.username,
  };
}

/**
 * Guard for seller pages. Redirects to login when signed out, to billing when
 * the store's subscription has lapsed, and enforces roles: by default only the
 * owner/managers (and superadmins); `roles` adds team roles, `anyRole` allows all.
 */
export async function requireSeller(opts: { roles?: Role[]; anyRole?: boolean; allowLocked?: boolean } = {}): Promise<SellerContext> {
  const ctx = await getSeller();
  if (!ctx) redirect('/admin-login');
  if (ctx.locked && !opts.allowLocked) {
    redirect(ctx.userType === 'admin' ? '/dashboard/billing?locked=1' : '/account-locked');
  }
  // Pages are owner/manager-only unless they list extra roles (or allow any role).
  if (!opts.anyRole && !['admin', 'superadmin'].includes(ctx.role) && !(opts.roles || []).includes(ctx.role)) {
    redirect(`${dashboardUrl(ctx.role)}?error=${encodeURIComponent('You do not have permission to access that page')}`);
  }
  return ctx;
}

/** For Route Handlers / Server Actions: same checks, but returns an error instead of redirecting. */
export async function sellerOrError(opts: { roles?: Role[]; allowLocked?: boolean } = {}): Promise<SellerContext | { error: string; status: number }> {
  const ctx = await getSeller();
  if (!ctx) return { error: 'Not authenticated', status: 401 };
  if (ctx.locked && !opts.allowLocked) return { error: 'Your subscription has lapsed. Renew it in Billing to continue.', status: 402 };
  if (opts.roles && !['admin', 'superadmin'].includes(ctx.role) && !opts.roles.includes(ctx.role)) {
    return { error: 'You do not have permission for this action', status: 403 };
  }
  return ctx;
}

export async function requireSuperadmin(): Promise<SellerContext> {
  const ctx = await requireSeller({ allowLocked: true });
  if (ctx.role !== 'superadmin') redirect('/dashboard?error=Access%20denied');
  return ctx;
}
