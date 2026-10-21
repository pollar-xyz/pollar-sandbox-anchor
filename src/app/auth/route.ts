import { type NextRequest, NextResponse } from 'next/server';
import { limitByAccount, limitByIp } from '@/lib/rate-limit';
import { buildChallenge, signSep10Jwt, verifyChallenge } from '@/lib/sep10';
import { errorResponse, jsonError, preflight, readBody } from '@/lib/sep24/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = limitByIp(request);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const account = params.get('account');
  if (account) {
    const byAccount = limitByAccount(account);
    if (byAccount) return byAccount;
  }
  try {
    const challenge = await buildChallenge({
      account,
      memo: params.get('memo'),
      homeDomain: params.get('home_domain'),
      clientDomain: params.get('client_domain'),
    });
    return NextResponse.json(challenge);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const limited = limitByIp(request);
  if (limited) return limited;
  try {
    const { transaction } = await readBody(request);
    if (!transaction) return jsonError(400, 'transaction is required');
    const claims = await verifyChallenge(transaction);
    const byAccount = limitByAccount(claims.account);
    if (byAccount) return byAccount;
    return NextResponse.json({ token: await signSep10Jwt(claims) });
  } catch (err) {
    return errorResponse(err);
  }
}

export function OPTIONS() {
  return preflight();
}
