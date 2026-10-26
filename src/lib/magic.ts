import { fromStroops, toStroops } from './amount';
import type { FiatCode } from './assets';

type MagicStatus = 'error' | 'refunded' | 'expired' | 'too_small' | 'too_large' | 'no_market';

const BASE_AMOUNTS: Record<string, { status: MagicStatus; label: string }> = {
  '13.13': { status: 'error', label: 'anchor error' },
  '66.60': { status: 'refunded', label: 'refund' },
  '77.70': { status: 'expired', label: 'expiration' },
  '11.11': { status: 'too_small', label: 'too_small' },
  '2999.99': { status: 'too_large', label: 'too_large' },
  '55.55': { status: 'no_market', label: 'no_market' },
};

/** COP limits start at 10000, so its magic amounts are the base ones times 1000. */
const SCALE: Record<FiatCode, bigint> = { ARS: 1n, PEN: 1n, COP: 1000n };

export interface MagicAmount {
  amount: string;
  status: MagicStatus;
  message: string;
}

/**
 * Amounts that force a terminal outcome, so integrators can exercise every failure path.
 * All of them sit inside the asset's limits. Published in /docs.
 */
export function magicAmounts(code: FiatCode): MagicAmount[] {
  return Object.entries(BASE_AMOUNTS).map(([base, { status, label }]) => {
    const amount = fromStroops(toStroops(base) * SCALE[code], 2);
    return { amount, status, message: `Simulated ${label} (magic amount ${amount}).` };
  });
}

export function magicOutcome(code: FiatCode, amountIn: string): MagicAmount | null {
  const value = toStroops(amountIn);
  return magicAmounts(code).find((m) => toStroops(m.amount) === value) ?? null;
}
