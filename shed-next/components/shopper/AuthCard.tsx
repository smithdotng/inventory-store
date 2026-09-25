import type { ReactNode } from 'react';
import { Container } from '../ui';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="py-10 sm:py-16">
      <div className="card mx-auto max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-6 text-center text-sm text-subtle">{footer}</p>}
    </Container>
  );
}
