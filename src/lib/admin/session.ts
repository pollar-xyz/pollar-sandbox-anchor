// Contract for the admin login (F1). Google OAuth with the same client as the Pollar admin,
// restricted to ADMIN_EMAILS. No dependency on Pollar services.

export interface AdminSession {
  email: string;
  name?: string;
}

/** Returns the admin session from the request cookies, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  throw new Error('Not implemented yet (DEV-136)');
}

/** For server components and route handlers under /admin: throws or redirects when there is no session. */
export async function requireAdmin(): Promise<AdminSession> {
  throw new Error('Not implemented yet (DEV-136)');
}
