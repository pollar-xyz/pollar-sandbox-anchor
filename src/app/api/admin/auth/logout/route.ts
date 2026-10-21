import { NextResponse } from 'next/server';
import { sessionCookieOptions } from '@/lib/admin/session';
import { SESSION_COOKIE } from '@/lib/admin/tokens';
import { publicUrl } from '@/lib/stellar';

export async function POST() {
  // 303 so the browser follows the form POST with a GET.
  const response = NextResponse.redirect(publicUrl('/admin/login?logged_out=1'), 303);
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
}
