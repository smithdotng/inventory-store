import { Container } from '@/components/ui';
import { pageMeta } from '@/lib/seo';
import { ContactForm } from '@/components/ContactForm';
import { Icon } from '@/components/Icon';

export const metadata = pageMeta({ title: 'Contact us', description: "Get in touch with the Shed team. We're here to help with your inventory, invoicing and storefront questions.", path: '/contact' });

export default function ContactPage() {
  return (
    <Container className="py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Talk to us</h1>
          <p className="mt-3 text-lg text-subtle">Questions about your store, billing or getting started? We usually reply within one working day.</p>
          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-dark"><Icon name="chat" size={18} /></span> hello@shed.ng</li>
            <li className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-dark"><Icon name="globe" size={18} /></span> Abuja, Nigeria</li>
          </ul>
        </div>
        <div className="card p-6 sm:p-8"><ContactForm /></div>
      </div>
    </Container>
  );
}
