import Link from 'next/link';
import { Container } from '@/components/ui';
import { Icon } from '@/components/Icon';

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-subtle ring-1 ring-line">
        <Icon name="search" size={28} />
      </span>
      <h1 className="mt-5 text-3xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-md text-subtle">The store or product may have been removed, or the link is incorrect.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn btn-dark">Go home</Link>
        <Link href="/search" className="btn btn-outline">Search products</Link>
      </div>
    </Container>
  );
}
