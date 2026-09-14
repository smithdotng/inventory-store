import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

export interface SessionUser {
  username: string;
  role: string | null;
  userType: string;
  firstName: string | null;
}

export interface BusinessContext {
  adminId: string;
  username: string;
  businessName: string;
  logo: string | null;
  currency: string;
}

/**
 * Server-side fetch to the Express backend that forwards the incoming request's
 * cookies, so session-authenticated API routes work from Server Components.
 */
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieHeader = cookies().toString();
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { cookie: cookieHeader, ...(init?.headers || {}) },
    cache: 'no-store',
  });
}

/** Returns the current session (user + business) or null if unauthenticated. */
export async function getSession(): Promise<{ user: SessionUser; business: BusinessContext | null } | null> {
  const res = await serverFetch('/api/auth/me');
  if (!res.ok) return null;
  return res.json();
}

/** Guards a dashboard page: returns the session or redirects to /login. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** Fetches dashboard JSON, redirecting to /login on 401. Throws on other errors. */
export async function dashboardGet<T>(path: string): Promise<T> {
  const res = await serverFetch(path);
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}
