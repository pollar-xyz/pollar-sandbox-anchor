import { type NextRequest, NextResponse } from 'next/server';
import { FIAT_CODES } from '@/lib/assets';
import { limitByIp } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { errorResponse, preflight } from '@/lib/sep24/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = limitByIp(request);
  if (limited) return limited;
  try {
    const { fees } = await getSettings();
    const deposit: Record<string, unknown> = {};
    const withdraw: Record<string, unknown> = {};
    for (const code of FIAT_CODES) {
      for (const [target, cfg] of [
        [deposit, fees[code].deposit],
        [withdraw, fees[code].withdraw],
      ] as const) {
        target[code] = {
          enabled: true,
          min_amount: Number(cfg.min),
          max_amount: Number(cfg.max),
          fee_fixed: Number(cfg.fee_fixed),
          fee_percent: Number(cfg.fee_percent),
        };
      }
    }
    return NextResponse.json({
      deposit,
      withdraw,
      fee: { enabled: true, authentication_required: true },
      transactions: { enabled: true, authentication_required: true },
      transaction: { enabled: true, authentication_required: true },
      features: { account_creation: false, claimable_balances: false },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export function OPTIONS() {
  return preflight();
}
