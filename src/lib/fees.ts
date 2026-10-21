import { fromStroops, toStroops } from './amount';
import type { FiatCode } from './assets';
import type { Settings } from './settings';

export type Operation = 'deposit' | 'withdraw';

export interface FeeQuote {
  amount_in: string;
  amount_fee: string;
  amount_out: string;
}

/** fee = fee_fixed + amount_in * fee_percent / 100, rounded to 2 decimals like the fiat it models. */
export function quoteFee(settings: Settings, asset: FiatCode, op: Operation, amountIn: string): FeeQuote {
  const cfg = settings.fees[asset][op];
  const amount = toStroops(amountIn);
  const percentFee = (amount * toStroops(cfg.fee_percent)) / toStroops('100');
  const fee = toStroops(fromStroops(toStroops(cfg.fee_fixed) + percentFee, 2));
  const out = amount > fee ? amount - fee : 0n;
  return { amount_in: fromStroops(amount, 2), amount_fee: fromStroops(fee, 2), amount_out: fromStroops(out, 2) };
}

export type LimitCheck = { ok: true } | { ok: false; reason: 'too_small' | 'too_large'; min: string; max: string };

export function checkLimits(settings: Settings, asset: FiatCode, op: Operation, amountIn: string): LimitCheck {
  const { min, max } = settings.fees[asset][op];
  const amount = toStroops(amountIn);
  if (amount < toStroops(min)) return { ok: false, reason: 'too_small', min, max };
  if (amount > toStroops(max)) return { ok: false, reason: 'too_large', min, max };
  return { ok: true };
}
