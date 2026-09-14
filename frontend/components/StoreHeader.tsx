import Link from 'next/link';
import type { Store } from '@/lib/types';
import { Container } from './ui';
import { CartButton } from './Cart';

const SOCIALS: { key: keyof NonNullable<Store['social']>; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'website', label: 'Website' },
];

export function StoreHeader({ store }: { store: Store }) {
  const initials = (store.businessName || store.username).slice(0, 2).toUpperCase();

  return (
    <header className="border-b border-line bg-surface">
      <Container className="flex h-16 items-center justify-between">
        <Link href={`/store/${store.username}`} className="flex items-center gap-3">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo} alt={store.businessName} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-hover">
              {initials}
            </span>
          )}
          <span className="text-lg font-bold">{store.businessName}</span>
        </Link>
        <CartButton storeUsername={store.username} />
      </Container>

      <div className="bg-ink text-surface">
        <Container className="flex flex-col gap-3 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold sm:text-4xl">{store.businessName}</h1>
            {store.description && (
              <p className="mt-2 max-w-xl text-surface/70">{store.description}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-surface/70">
              {SOCIALS.map(({ key, label }) =>
                store.social?.[key] ? (
                  <a
                    key={key}
                    href={store.social[key] as string}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-primary"
                  >
                    {label}
                  </a>
                ) : null,
              )}
            </div>
          </div>
          {store.whatsappNumber && (
            <a
              href={`https://wa.me/${store.whatsappNumber.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary self-start sm:self-auto"
            >
              Chat on WhatsApp
            </a>
          )}
        </Container>
      </div>
    </header>
  );
}
