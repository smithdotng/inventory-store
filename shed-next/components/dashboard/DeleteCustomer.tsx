'use client';

import { useTransition, useState } from 'react';
import { deleteCustomerAction } from '@/lib/actions/seller';

export function DeleteCustomer({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-right">
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete ${name}? Their past sales stay in your records.`)) return;
          start(async () => {
            const r = await deleteCustomerAction(id);
            if (r?.error) setError(r.error);
          });
        }}
        className="text-sm font-medium text-danger hover:underline"
      >
        {pending ? 'Deleting…' : 'Delete customer'}
      </button>
    </div>
  );
}
