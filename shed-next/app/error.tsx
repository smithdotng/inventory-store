'use client';

import { Container } from '@/components/ui';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <h1 className="text-3xl font-extrabold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-subtle">We couldn&apos;t load this page. Please check your connection and try again.</p>
      <button onClick={reset} className="btn btn-dark mt-8">Try again</button>
    </Container>
  );
}
