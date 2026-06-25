'use client';

import { useEffect } from 'react';
import { Button, ButtonLink, Container } from '@/components/ui';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <span className="text-7xl font-extrabold text-primary">500</span>
      <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-subtle">
        An unexpected error occurred while loading this page. Please try again.
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="outline">
          Back home
        </ButtonLink>
      </div>
    </Container>
  );
}
