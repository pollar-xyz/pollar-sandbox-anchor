import { cookies } from 'next/headers';
import { verifyInteractiveToken, type InteractiveClaims } from '@/lib/interactive-token';

export const SESSION_COOKIE = 'interactive_token';

export function sessionCookiePath(id: string): string {
  return `/interactive/${encodeURIComponent(id)}`;
}

/** Verifies a token and checks it was issued for this transaction. */
export async function claimsForTransaction(token: string | undefined, id: string): Promise<InteractiveClaims | null> {
  if (!token) return null;
  try {
    const claims = await verifyInteractiveToken(token);
    return claims.transactionId === id ? claims : null;
  } catch {
    return null;
  }
}

/** Reads the cookie set by the session route. The cookie path keeps one transaction's token away from another's. */
export async function readSession(id: string): Promise<InteractiveClaims | null> {
  const store = await cookies();
  return claimsForTransaction(store.get(SESSION_COOKIE)?.value, id);
}
