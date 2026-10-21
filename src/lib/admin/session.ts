import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminEmails, env } from '../env';
import { isAllowedEmail, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from './tokens';

export interface AdminSession {
  email: string;
  name?: string;
}

/** Thrown by requireAdminAction when the request carries no valid admin session. */
export class AdminAuthError extends Error {
  readonly status = 401;
  constructor() {
    super('Sesión de admin inválida o expirada');
    this.name = 'AdminAuthError';
  }
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  return signSession(session, env().AUTH_SECRET, SESSION_TTL_SECONDS);
}

/**
 * Returns the admin session from the request cookies, or null.
 * The allowlist is checked again so removing an email from ADMIN_EMAILS revokes live sessions.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token, env().AUTH_SECRET);
  if (!claims || !isAllowedEmail(claims.email, adminEmails())) return null;
  return claims;
}

/** For server components under /admin: redirects to the login page when there is no session. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}

/** For route handlers and server actions: throws AdminAuthError (401) when there is no session. */
export async function requireAdminAction(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new AdminAuthError();
  return session;
}
