import type { Store } from '@/lib/types';
import { realImage, whatsappLink } from '@/lib/format';
import { Container } from './ui';
import { Img } from './Img';
import { Icon, WhatsAppIcon } from './Icon';

export function StoreHero({ store, productCount }: { store: Store; productCount: number }) {
  const socials = [
    { key: 'instagram', icon: 'instagram', label: 'Instagram' },
    { key: 'website', icon: 'globe', label: 'Website' },
    { key: 'facebook', icon: 'globe', label: 'Facebook' },
    { key: 'twitter', icon: 'globe', label: 'X / Twitter' },
  ] as const;

  return (
    <section className="border-b border-line bg-surface">
      <div className="h-24 bg-gradient-to-r from-ink via-ink to-[#3a2a12] sm:h-32" />
      <Container className="-mt-10 pb-6 sm:-mt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-surface bg-surface shadow-card sm:h-24 sm:w-24">
              <Img src={realImage(store.logo)} alt={store.businessName} fallback="store" loading="eager" />
            </span>
            <div className="min-w-0 sm:pb-1">
              <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{store.businessName}</h1>
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-subtle">
                <span>@{store.username}</span>
                <span>{productCount} products</span>
                {store.country && <span>{store.country}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {store.whatsappNumber && (
              <a href={whatsappLink(store.whatsappNumber, `Hi ${store.businessName}, I found your store on Shed.`)} target="_blank" rel="noreferrer" className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]">
                <WhatsAppIcon size={18} /> Chat with seller
              </a>
            )}
            {socials.map(({ key, icon, label }) =>
              store.social?.[key] ? (
                <a key={key} href={store.social[key] as string} target="_blank" rel="noreferrer" aria-label={label} title={label} className="btn btn-outline h-11 w-11 px-0">
                  <Icon name={icon} size={18} />
                </a>
              ) : null,
            )}
          </div>
        </div>
        {store.description && <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink/75">{store.description}</p>}
      </Container>
    </section>
  );
}
