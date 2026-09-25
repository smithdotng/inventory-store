export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: string[]; // omitted = admin/manager/superadmin only
  ownerOnly?: boolean;
  superOnly?: boolean;
}

/** Sidebar entries. `roles` lists the team roles (besides admin) that can see an item. */
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Sell',
    items: [
      { href: '/dashboard', label: 'Overview', icon: 'home' },
      { href: '/dashboard/pos', label: 'Point of sale', icon: 'cart', roles: ['cashier', 'stock_clerk'] },
      { href: '/dashboard/sales', label: 'Sales', icon: 'receipt' },
      { href: '/dashboard/invoices', label: 'Invoices', icon: 'tag' },
    ],
  },
  {
    section: 'Manage',
    items: [
      { href: '/dashboard/inventory', label: 'Inventory', icon: 'box', roles: ['stock_clerk'] },
      { href: '/dashboard/customers', label: 'Customers', icon: 'user' },
      { href: '/dashboard/outlets', label: 'Outlets', icon: 'store' },
      { href: '/dashboard/messages', label: 'Messages', icon: 'chat' },
    ],
  },
  {
    section: 'Account',
    items: [
      { href: '/dashboard/settings', label: 'Store settings', icon: 'gear' },
      { href: '/dashboard/team', label: 'Team', icon: 'user' },
      { href: '/dashboard/billing', label: 'Billing', icon: 'lock', ownerOnly: true },
    ],
  },
  {
    section: 'Shed platform',
    items: [
      { href: '/dashboard/admin', label: 'Stores', icon: 'store', superOnly: true },
      { href: '/dashboard/admin/clusters', label: 'Markets', icon: 'grid', superOnly: true },
      { href: '/dashboard/admin/ads', label: 'Featured ads', icon: 'tag', superOnly: true },
      { href: '/dashboard/admin/blog', label: 'Blog', icon: 'book', superOnly: true },
      { href: '/dashboard/admin/messages', label: 'Announcements', icon: 'chat', superOnly: true },
      { href: '/dashboard/admin/people', label: 'Affiliates & outlets', icon: 'user', superOnly: true },
      { href: '/dashboard/admin/support', label: 'Support inbox', icon: 'info', superOnly: true },
    ],
  },
];

export function canSee(item: NavItem, role: string, isOwner: boolean) {
  if (item.superOnly) return role === 'superadmin';
  if (item.ownerOnly) return isOwner || role === 'superadmin';
  if (role === 'admin' || role === 'superadmin') return true;
  return !!item.roles?.includes(role);
}
