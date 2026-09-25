import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SITE, pageMeta } from '@/lib/seo';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-outfit', display: 'swap' });

const base = pageMeta({});

export const metadata: Metadata = {
  ...base,
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: '%s · Shed' },
  applicationName: SITE.name,
  keywords: ['Shed', 'inventory', 'point of sale', 'POS', 'invoices', 'online store', 'Nigeria', 'small business', 'marketplace'],
  openGraph: { ...base.openGraph, url: '/' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: { title: 'Shed', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#141414', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="min-h-screen">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
