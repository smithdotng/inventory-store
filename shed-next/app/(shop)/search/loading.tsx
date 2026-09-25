import { Container } from '@/components/ui';

export default function Loading() {
  return (
    <Container className="py-8">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-line/70" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="aspect-square animate-pulse bg-line/50" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-3/4 animate-pulse rounded bg-line/70" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-line/70" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
