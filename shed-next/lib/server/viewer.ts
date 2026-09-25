import 'server-only';
import { getSession } from './session';
import { dashboardUrl, getSeller } from './auth';

/**
 * Who is looking at the marketplace — used by the header account menu.
 * A browser can hold a shopper sign-in and a seller sign-in at the same time
 * (they share one session cookie), so both are returned.
 */
export type MenuLink = { href: string; label: string; icon: string };

export interface Viewer {
  /** Name shown in place of "Account". */
  name: string;
  shopper: { name: string; email: string } | null;
  seller: {
    name: string;
    businessName: string;
    storeUsername: string;
    roleLabel: string;
    links: MenuLink[];
  } | null;
}

const ROLE_LABEL: Record<string, string> = { superadmin: 'Shed admin', admin: 'Store owner', cashier: 'Cashier', stock_clerk: 'Stock clerk' };

export async function getViewer(): Promise<Viewer | null> {
  const session = await getSession();
  if (!session) return null;

  const s = session.shopper as { firstName?: string; lastName?: string; email?: string } | undefined;
  const shopper = s?.email ? { name: [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email.split('@')[0], email: s.email } : null;

  let seller: Viewer['seller'] = null;
  if (session.admin || session.userId) {
    const ctx = await getSeller().catch(() => null);
    if (ctx) {
      const role = ctx.role;
      const owner = role === 'admin' || role === 'superadmin';
      const links: MenuLink[] = [{ href: dashboardUrl(role), label: role === 'superadmin' ? 'Shed platform' : 'Dashboard', icon: 'grid' }];
      if (role === 'superadmin') links.push({ href: '/dashboard', label: 'Seller dashboard', icon: 'store' });
      if (owner || role === 'cashier' || role === 'stock_clerk') links.push({ href: '/dashboard/pos', label: 'Point of sale', icon: 'receipt' });
      if (owner || role === 'stock_clerk') links.push({ href: '/dashboard/inventory', label: 'Inventory', icon: 'box' });
      if (owner) links.push({ href: '/dashboard/sales', label: 'Sales & orders', icon: 'tag' });
      if (role !== 'superadmin') links.push({ href: `/store/${ctx.admin.username}`, label: 'View my store', icon: 'globe' });
      links.push({ href: '/dashboard/settings', label: owner ? 'Store settings' : 'Change password', icon: 'gear' });
      seller = {
        name: ctx.displayName,
        businessName: ctx.admin.businessName || ctx.admin.username,
        storeUsername: ctx.admin.username,
        roleLabel: ctx.userType === 'business_user' && role === 'admin' ? 'Manager' : ROLE_LABEL[role] || 'Team member',
        links: links.filter((l, i) => links.findIndex((x) => x.href === l.href) === i), // cashier's dashboard *is* the POS
      };
    }
  }

  if (!shopper && !seller) return null;
  const first = (n: string) => n.trim().split(/\s+/)[0];
  return { name: first(shopper?.name || seller!.name), shopper, seller };
}
