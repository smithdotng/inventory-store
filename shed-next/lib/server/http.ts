import 'server-only';
import { NextResponse } from 'next/server';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Wrap a route handler: known errors (with .status) become JSON errors, others 500. */
export function handler<A extends any[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
      const known = typeof e?.status === 'number';
      if (!known) console.error(e);
      return json({ error: known ? e.message : 'Internal server error' }, known ? e.status : 500);
    }
  };
}

/** Read JSON or form bodies uniformly. */
export async function readBody(req: Request): Promise<Record<string, any>> {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return (await req.json().catch(() => ({}))) || {};
  if (type.includes('form')) {
    const fd = await req.formData();
    const out: Record<string, any> = {};
    fd.forEach((v, k) => {
      if (k in out) out[k] = ([] as any[]).concat(out[k], v);
      else out[k] = v;
    });
    return out;
  }
  return {};
}

export const intParam = (v: string | null, def: number) => {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

/** True for router/browser prefetches — GET routes with side effects (sign-out) must ignore them. */
export function isPrefetch(req: Request) {
  const h = req.headers;
  return h.has('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch') === true;
}
