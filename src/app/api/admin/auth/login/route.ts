import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieOptions } from '@/lib/admin/session';
import {
  createPkce,
  googleAuthUrl,
  NEXT_COOKIE,
  OAUTH_COOKIE_TTL_SECONDS,
  randomToken,
  safeNextPath,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from '@/lib/admin/tokens';
import { env } from '@/lib/env';
import { publicUrl } from '@/lib/stellar';

export async function GET(request: NextRequest) {
  let clientId: string;
  let redirectUri: string;
  try {
    clientId = env().AUTH_GOOGLE_ID;
    redirectUri = publicUrl('/api/admin/auth/callback');
  } catch {
    // Without a valid env there is no PUBLIC_URL either, so fall back to the request origin.
    return NextResponse.redirect(new URL('/admin/login?error=config', request.nextUrl.origin));
  }

  const state = randomToken();
  const { verifier, challenge } = createPkce();
  const response = NextResponse.redirect(googleAuthUrl({ clientId, redirectUri, state, challenge }));
  const opts = { ...sessionCookieOptions(OAUTH_COOKIE_TTL_SECONDS), path: '/api/admin/auth' };
  response.cookies.set(STATE_COOKIE, state, opts);
  response.cookies.set(VERIFIER_COOKIE, verifier, opts);
  response.cookies.set(NEXT_COOKIE, safeNextPath(request.nextUrl.searchParams.get('next')), opts);
  return response;
}
