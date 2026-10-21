import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode, verifyIdToken } from '@/lib/admin/google';
import { createSessionToken, sessionCookieOptions } from '@/lib/admin/session';
import {
  isAllowedEmail,
  NEXT_COOKIE,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STATE_COOKIE,
  stateMatches,
  VERIFIER_COOKIE,
} from '@/lib/admin/tokens';
import { adminEmails, env } from '@/lib/env';
import { publicUrl } from '@/lib/stellar';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  const next = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value);

  const fail = (error: string) => clearOAuthCookies(NextResponse.redirect(publicUrl(`/admin/login?error=${error}`)));

  const googleError = params.get('error');
  if (googleError) return fail(googleError === 'access_denied' ? 'access_denied' : 'oauth_failed');
  const code = params.get('code');
  if (!code || !verifier || !stateMatches(state, params.get('state'))) return fail('state_mismatch');

  try {
    const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = env();
    const idToken = await exchangeCode({
      code,
      verifier,
      clientId: AUTH_GOOGLE_ID,
      clientSecret: AUTH_GOOGLE_SECRET,
      redirectUri: publicUrl('/api/admin/auth/callback'),
    });
    const identity = await verifyIdToken(idToken, AUTH_GOOGLE_ID);
    if (!identity.emailVerified) return fail('email_unverified');
    if (!isAllowedEmail(identity.email, adminEmails())) return fail('not_allowed');

    const token = await createSessionToken({ email: identity.email.toLowerCase(), name: identity.name });
    const response = NextResponse.redirect(publicUrl(next));
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_SECONDS));
    return clearOAuthCookies(response);
  } catch (err) {
    console.error('[admin-auth] callback failed:', err instanceof Error ? err.message : err);
    return fail('oauth_failed');
  }
}

function clearOAuthCookies(response: NextResponse): NextResponse {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE]) {
    response.cookies.set(name, '', { path: '/api/admin/auth', maxAge: 0 });
  }
  return response;
}
