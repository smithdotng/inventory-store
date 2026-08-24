'use client';

import { useCallback, useEffect, useState } from 'react';

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { cache: 'no-store' }));
}

export async function apiJson<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  body?: unknown,
): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

export async function apiForm<T = unknown>(path: string, form: FormData): Promise<T> {
  return handle<T>(await fetch(path, { method: 'POST', body: form }));
}

/** Small data hook: fetches `path` and exposes loading/error + a reload(). */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiGet<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
