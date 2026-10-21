import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

// Pure helpers for the admin login: no Next.js or env access, so they can be unit tested.

export interface SessionClaims {
  email: string;
  name?: string;
}

export const SESSION_COOKIE = 'sa_admin_session';
export const STATE_COOKIE = 'sa_oauth_state';
export const VERIFIER_COOKIE = 'sa_oauth_verifier';
export const NEXT_COOKIE = 'sa_oauth_next';

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const OAUTH_COOKIE_TTL_SECONDS = 10 * 60;

const ISSUER = 'pollar-sandbox-anchor';
const AUDIENCE = 'admin';

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  claims: SessionClaims,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ email: claims.email, ...(claims.name ? { name: claims.name } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key(secret));
}

/** Returns the claims of a valid, unexpired session token, or null. */
export async function verifySession(token: string | undefined, secret: string): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.email !== 'string' || !payload.email) return null;
    return { email: payload.email, ...(typeof payload.name === 'string' ? { name: payload.name } : {}) };
  } catch {
    return null;
  }
}

export function isAllowedEmail(email: string | undefined | null, allowlist: readonly string[]): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.some((allowed) => allowed.trim().toLowerCase() === normalized);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** RFC 7636 S256 challenge for a code verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  return { verifier, challenge: pkceChallenge(verifier) };
}

/** Constant-time comparison of the state echoed by Google against the cookie. */
export function stateMatches(expected: string | undefined, received: string | null | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function googleAuthUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/** Only same-site admin paths are accepted as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/admin') || next.startsWith('/admin/login') || next.includes('//') || next.includes('\\')) {
    return '/admin';
  }
  return next;
}
