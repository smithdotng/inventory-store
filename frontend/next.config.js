/** @type {import('next').NextConfig} */

// Express backend base URL. In dev this is the local Node server on :3000.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Store logos / product images are served by the Express app from /public
    // and may also be remote URLs. Allow them through next/image.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async redirects() {
    // Permanent redirects from the legacy Express/EJS paths to the new Next
    // routes, so old QR codes, WhatsApp shares and bookmarked links keep working.
    // Query strings (e.g. ?token=, ?q=) are forwarded automatically.
    return [
      // Public (Phase 1)
      { source: '/landing', destination: '/', permanent: true },
      { source: '/search', destination: '/discover', permanent: true },
      {
        source: '/store/:username/product/:id',
        destination: '/store/:username/products/:id',
        permanent: true,
      },
      {
        source: '/store/:username/confirmation/:saleId',
        destination: '/store/:username/order/:saleId',
        permanent: true,
      },
      // Admin dashboard (Phase 2)
      { source: '/admin-login', destination: '/login', permanent: true },
      { source: '/home', destination: '/dashboard', permanent: true },
      { source: '/store-view', destination: '/dashboard/products', permanent: true },
      { source: '/update-stock', destination: '/dashboard/products', permanent: false },
      { source: '/transactions', destination: '/dashboard/transactions', permanent: true },
      { source: '/invoices', destination: '/dashboard/invoices', permanent: true },
      { source: '/customers', destination: '/dashboard/customers', permanent: true },
      { source: '/profile', destination: '/dashboard/profile', permanent: true },
      { source: '/business-users', destination: '/dashboard/team', permanent: true },
    ];
  },
  async rewrites() {
    return {
      // Explicit proxies for API + legacy asset paths (run before Next routing).
      beforeFiles: [
        { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
        { source: '/uploads/:path*', destination: `${BACKEND_URL}/uploads/:path*` },
        { source: '/images/:path*', destination: `${BACKEND_URL}/images/:path*` },
        { source: '/img/:path*', destination: `${BACKEND_URL}/img/:path*` },
      ],
      // Fallback: anything Next doesn't have a page/route for is proxied to
      // Express. This keeps every un-migrated area (POS, outlet portal,
      // referrals, superadmin + their CSS/JS assets) working through the
      // single Next origin, sharing the session cookie.
      fallback: [{ source: '/:path*', destination: `${BACKEND_URL}/:path*` }],
    };
  },
};

module.exports = nextConfig;
