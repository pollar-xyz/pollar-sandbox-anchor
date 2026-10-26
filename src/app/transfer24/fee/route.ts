import { type NextRequest, NextResponse } from 'next/server';
import { isValidAmount } from '@/lib/amount';
import { isFiatCode } from '@/lib/assets';
import { quoteFee } from '@/lib/fees';
import { getSettings } from '@/lib/settings';
import { authenticate, errorResponse, jsonError, preflight } from '@/lib/sep24/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth instanceof NextResponse) return auth;
  const params = request.nextUrl.searchParams;
  const operation = params.get('operation');
  const assetCode = params.get('asset_code') ?? '';
  const amount = params.get('amount') ?? '';
  if (operation !== 'deposit' && operation !== 'withdraw') return jsonError(400, 'operation must be deposit or withdraw');
  if (!isFiatCode(assetCode)) return jsonError(400, 'asset_code must be ARS, PEN or COP');
  if (!isValidAmount(amount)) return jsonError(400, 'amount must be a positive decimal');
  try {
    const quote = quoteFee(await getSettings(), assetCode, operation, amount);
    return NextResponse.json({ fee: Number(quote.amount_fee) });
  } catch (err) {
    return errorResponse(err);
  }
}

export function OPTIONS() {
  return preflight();
}
