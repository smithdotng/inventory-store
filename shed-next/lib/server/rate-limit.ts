import 'server-only';

// Simple in-memory fixed-window limiter (per server instance), like express-rate-limit's default store.
const g = globalThis as unknown as { __shedRate?: Map<string, { n: number; reset: number }> };
const hits = (g.__shedRate ||= new Map());

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n += 1;
  return h.n <= max;
}
