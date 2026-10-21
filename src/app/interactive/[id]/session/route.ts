import { NextResponse, type NextRequest } from 'next/server';
import { claimsForTransaction, SESSION_COOKIE, sessionCookiePath } from '../../_lib/session';

// Cookies cannot be set while a page renders, so the page bounces ?token= here once.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get('token') ?? undefined;
  const path = sessionCookiePath(id);
  const claims = await claimsForTransaction(token, id);

  // A relative Location keeps the redirect on the public host when running behind a proxy.
  const response = new NextResponse(null, {
    status: 303,
    headers: { location: claims ? path : `${path}?expired=1`, 'cache-control': 'no-store' },
  });
  if (claims && token) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path,
      maxAge: 15 * 60,
    });
  }
  return response;
}
