/** @type {import('next').NextConfig} */

/**
 * Optional: URL of the old Express app while the migration is in progress.
 * Any path this app doesn't handle yet is proxied there (same origin, so the
 * shared `connect.sid` session cookie keeps working). Leave unset once every
 * area has moved over.
 */
const LEGACY_APP_URL = process.env.LEGACY_APP_URL || '';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Node-only packages that must not be bundled (pdfkit reads its font files from disk).
    serverComponentsExternalPackages: ['mongodb', 'pdfkit', 'nodemailer', 'bcryptjs', 'sanitize-html'],
    serverActions: { bodySizeLimit: '12mb' }, // product photos / logos
    instrumentationHook: true, // daily subscription sweep (instrumentation.ts)
  },
  async headers() {
    return [
      // The service worker must always be re-checked so updates reach installed apps quickly.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }, { key: 'Content-Type', value: 'application/manifest+json' }] },
      { source: '/offline.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
  async redirects() {
    // Old Express/EJS URLs → new routes, so bookmarks, QR codes, WhatsApp shares and emails keep working.
    return [
      { source: '/landing', destination: '/', permanent: true },
      { source: '/discover', destination: '/search', permanent: true },
      { source: '/store/:username/product/:id', destination: '/store/:username/products/:id', permanent: true },
      {
        source: '/store/:username/confirmation/:saleId',
        has: [{ type: 'query', key: 'format', value: 'pdf' }],
        destination: '/api/public/store/:username/order/:saleId/invoice.pdf',
        permanent: false,
      },
      { source: '/store/:username/confirmation/:saleId', destination: '/store/:username/order/:saleId', permanent: true },

      // Seller dashboard
      { source: '/home', destination: '/dashboard', permanent: true },
      { source: '/pos', destination: '/dashboard/pos', permanent: true },
      { source: '/inventory', destination: '/dashboard/inventory', permanent: true },
      { source: '/update-stock', destination: '/dashboard/inventory', permanent: true },
      { source: '/store-view', destination: '/dashboard/inventory', permanent: true },
      { source: '/transactions', destination: '/dashboard/sales', permanent: true },
      { source: '/commission-reports', destination: '/dashboard/outlets', permanent: true },
      { source: '/invoices', destination: '/dashboard/invoices', permanent: true },
      { source: '/invoices/download/:id', destination: '/dashboard/sales/:id/pdf?download=1', permanent: true },
      { source: '/invoices/preview/:id', destination: '/dashboard/sales/:id/pdf', permanent: true },
      { source: '/receipt/:id', destination: '/dashboard/sales/:id/pdf?download=1', permanent: true },
      { source: '/sale-success/:id', destination: '/dashboard/sales/:id', permanent: true },
      { source: '/sales/:id', destination: '/dashboard/sales/:id', permanent: true },
      { source: '/payment-sales-confirmation/:id', destination: '/dashboard/sales/:id', permanent: true },
      { source: '/customers', destination: '/dashboard/customers', permanent: true },
      { source: '/customer-details/:id', destination: '/dashboard/customers/:id', permanent: true },
      { source: '/edit-customer/:id', destination: '/dashboard/customers/:id', permanent: true },
      { source: '/profile', destination: '/dashboard/settings', permanent: true },
      { source: '/business-users', destination: '/dashboard/team', permanent: true },
      { source: '/admin-messages', destination: '/dashboard/messages', permanent: true },
      { source: '/admin-messages/trash', destination: '/dashboard/messages?box=trash', permanent: true },
      { source: '/billing', destination: '/dashboard/billing', permanent: true },

      // Outlets
      { source: '/create-outlet', destination: '/dashboard/outlets', permanent: true },
      { source: '/outlet-details/:id', destination: '/dashboard/outlets/:id', permanent: true },
      { source: '/dispense-to-outlet/:id', destination: '/dashboard/outlets/:id', permanent: true },
      { source: '/outlet/sales-form', destination: '/outlet-portal/sell', permanent: true },
      { source: '/outlet/:id/stock-view', destination: '/outlet-portal', permanent: true },
      { source: '/outlet-transactions/:id', destination: '/outlet-portal/sales', permanent: true },
      { source: '/outlet-customers/:id', destination: '/outlet-portal/sales', permanent: true },
      { source: '/referrals', destination: '/referrals/dashboard', permanent: false },
      { source: '/dashboard/admin/stores', destination: '/dashboard/admin', permanent: false },

      // Shoppers (the old OTP "buyer profile" is now part of shopper accounts)
      { source: '/buyer', destination: '/shopper/account', permanent: true },
      { source: '/buyer/login', destination: '/shopper/login', permanent: true },
      { source: '/buyer/logout', destination: '/shopper/logout', permanent: true },
    ];
  },
  async rewrites() {
    if (!LEGACY_APP_URL) return [];
    return { fallback: [{ source: '/:path*', destination: `${LEGACY_APP_URL}/:path*` }] };
  },
};

module.exports = nextConfig;
