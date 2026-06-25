import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ButtonLink, Container } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <Container className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="text-7xl font-extrabold text-primary">404</span>
        <h1 className="mt-4 text-2xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-2 max-w-md text-subtle">
          The store, product or page you&apos;re looking for may have moved or no longer exists.
        </p>
        <ButtonLink href="/" className="mt-8">
          Back home
        </ButtonLink>
      </Container>
      <SiteFooter />
    </>
  );
}
