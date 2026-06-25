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
    ];
  },
  async rewrites() {
    return [
      // Proxy API + legacy static asset paths to the Express backend so the
      // browser sees a single origin and existing session cookies keep working.
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND_URL}/uploads/:path*` },
      { source: '/images/:path*', destination: `${BACKEND_URL}/images/:path*` },
      { source: '/img/:path*', destination: `${BACKEND_URL}/img/:path*` },
    ];
  },
};

module.exports = nextConfig;
