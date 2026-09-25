# Shed — Next.js app

This folder is the whole Shed platform rebuilt as one **Next.js 14 (App Router)** app. It replaces the Express + EJS app in the repo root and the separate `storefront/` and `frontend/` folders.

It reads and writes the **same MongoDB database** with the same collections and document shapes. It also uses the **same session cookie** as the Express app. That means you can run both side by side while you switch over.

## Getting started

```bash
cd shed-next
npm install
cp .env.example .env.local   # or copy your existing Express .env — the variable names are the same
npm run dev                  # http://localhost:3000
```

For production, run `npm run build && npm start`, or deploy to Vercel.

- **`SESSION_SECRET` must match the Express app.** If it does, people who are already signed in stay signed in. Sessions are stored in the same `sessions` collection, in the connect-mongo format.
- **Uploaded images** are read from `UPLOADS_DIR`. By default that is `../public/uploads`, the Express folder, so both apps share the files. When you retire Express, move that folder somewhere permanent and update `UPLOADS_DIR`. Do the same for `LEGACY_PUBLIC_DIR`, which is used for the store logos on invoice PDFs.
- **Existing store owners:** run `npm run grandfather-admins` once. It gives accounts created before subscriptions a "legacy" plan, so they don't get locked out. The superadmin **Fix older stores** button does the same thing.
- **Subscription sweep** (trial reminders, expiry and card renewals):
  - On a normal Node server, it runs daily at 03:00 on its own (see `instrumentation-node.ts`).
  - On Vercel, `vercel.json` schedules `GET /api/cron/subscriptions`. Set `CRON_SECRET` for it.
- **Flutterwave:** point the dashboard webhook at `/webhooks/flutterwave` and set `FLW_SECRET_HASH`.

### Optional: gradual cut-over

Set `LEGACY_APP_URL=http://localhost:4000` (or wherever Express runs). Any URL this app doesn't handle will then be proxied to Express. Every Express page has been ported, so this is only a safety net.

## Branding & link previews

- Logo files are in `public/brand/`: `shed-logo.png` for light backgrounds, `shed-logo-light.png` for dark ones, and `shed-mark.png` for the symbol on its own. They are shown through the `<BrandLogo />` component.
- Open Graph and Twitter tags come from `lib/seo.ts`. Build a page's metadata with `pageMeta({...})` rather than writing `openGraph` by hand, because a page's own `openGraph` replaces the site defaults entirely.
- What a shared link shows:
  - Store links show the store's logo.
  - Product links show the first product photo, with the price and stock in the description.
  - Blog posts show their cover image.
  - Anything without an image falls back to `public/og-image.png` (1200×630).
- `BASE_URL` must be the public site address, because the preview image links are built from it.
- `/robots.txt` and `/sitemap.xml` are generated automatically. The sitemap lists public pages, open stores, markets and blog posts.

## Layout

```
app/
  (shop)/       marketplace: home, search, categories, stores, products, cart, checkout, orders,
                shopper account, markets (clusters), blog, contact, referrals dashboard, /sell
  (auth)/       seller login/register/verify/reset, team invite setup, outlet login, affiliate auth
  (seller)/dashboard/   seller dashboard (overview, POS, inventory, sales, invoices, customers,
                outlets, messages, team, settings, billing) + /dashboard/admin (superadmin)
  outlet-portal/ outlet staff: stock, sell, sales & commission
  api/…         JSON routes used by the browser (search, cart, checkout, auth)
  webhooks/, billing/callback, cart/checkout/callback, uploads/, health …
lib/server/     all database / business logic (server-only)
lib/actions/    Server Actions called by forms
components/     UI
```

Access rules come from `lib/server/auth.ts`:

- `requireSeller()` lets only owners in by default. Cashiers are allowed into POS and sales, and stock clerks into inventory.
- A store whose subscription has lapsed is sent to Billing.
- `/dashboard/admin` is for superadmins only.

### Account menu

- The marketplace header shows the signed-in person's name where "Account" used to be. Clicking it opens a menu of links that suit them (`components/AccountMenu.tsx`, built from `lib/server/viewer.ts`):
  - **Shopper:** orders, account details, cart and sign out.
  - **Seller:** dashboard, point of sale, inventory, sales, their store, settings and sign out. The links depend on the person's role, so a cashier only sees what they can open.
- One browser can be signed in as a shopper and as a seller at the same time. Signing in or out as one keeps the other.

### Installable app (PWA)

Shed can be installed from the browser on Android, iPhone/iPad and desktop, and then opens full-screen like a native app.

| Piece | Where |
|---|---|
| Manifest: name, icons, screenshots, shortcuts (POS, inventory, new invoice, search) | `public/manifest.json` |
| Start page: opens the dashboard for sellers (the POS for cashiers) and the marketplace for everyone else | `app/launch/route.ts` |
| Service worker | `public/sw.js` |
| Offline page | `public/offline.html` |
| Install prompt and "new version" banner | `components/pwa/` |

How the service worker handles requests:

- **Public marketplace pages** (home, search, store pages) are saved as people visit them, so they still open offline.
- **Private pages** (dashboard, account, cart, checkout, outlet portal) are never saved. Nor are API calls or PDFs.
- **Signing out** clears the saved pages.
- **Build files** load from the cache first. Images use a size-capped cache that refreshes in the background.

The install prompt appears after the second page view, on the home, search, store and dashboard overview pages. On iPhone it shows the "Share → Add to Home Screen" steps instead. "Not now" hides it for 14 days. Both account menus also have an **Install the app** item.

When a new version is deployed, installed apps show **"A new version of Shed is ready → Update"**. They don't reload in the middle of a sale.

**To ship a service worker change**, bump `VERSION` in `public/sw.js`, for example to `shed-v5`. That makes browsers pick up the new worker and clear the old caches.

**Screenshots:** the install screenshots in `public/screenshots/` were taken with demo data. Replace them with shots of the live site, keeping the same pixel sizes or updating `sizes` in the manifest.

## What replaced what

| Old (Express/EJS) | New |
|---|---|
| `/landing`, `/discover` | `/`, `/search` |
| `/store/:u/product/:id`, `/store/:u/confirmation/:id` | `/store/:u/products/:id`, `/store/:u/order/:id` |
| `/home`, `/pos`, `/inventory`, `/transactions`, `/invoices`, `/customers`, `/profile`, `/business-users`, `/admin-messages`, `/billing` | `/dashboard/…` equivalents |
| outlet pages (`/create-outlet`, `/outlet-details/:id`, `/outlet/sales-form` …) | `/dashboard/outlets`, `/outlet-portal` |
| `/buyer` OTP profile | merged into shopper accounts: "Email me a sign-in code" on `/shopper/login` |
| superadmin EJS pages | `/dashboard/admin` (stores, markets, ads, blog, messages, people, support) |
| `storefront/` Next app + Express `/api/public/*` | merged in, served by this app's own route handlers |

All the old URLs are listed in `next.config.js`. They redirect to the new pages, so bookmarks, QR codes and emailed links still work.

## Changes in behaviour

- A storefront "pay the seller" order link is now valid for **30 days**. It used to expire after 1 hour.
- Invoice PDFs write the currency as "NGN" rather than "₦", because the built-in PDF font has no ₦ glyph.
- Reconciliation problems with online cart payments are now saved to `reconciliation_flags`, which only superadmins can see. Before, they were sent as messages that every seller could see.
- Passwords are hashed with `bcryptjs`, not native `bcrypt`. The hashes are compatible, so existing passwords still work.

## Not carried over

- Debug and test endpoints, and the unused `/api/admin/*` JSON API.
- The invoice "upload/share" endpoints that did nothing.

## Tests

The app was tested end to end with Playwright against an in-memory MongoDB stand-in. The flows covered:

- Seller sign-up and login, inventory, POS, invoices and customers.
- Team roles and locked stores.
- Storefront checkout.
- Shopper accounts and cart sync.
- Outlets and commission.
- Affiliates and contact.
- Every superadmin screen.

Test it against a copy of your real database before you switch production traffic over.
