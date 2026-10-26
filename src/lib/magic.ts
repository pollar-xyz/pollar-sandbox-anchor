import { toStroops } from './amount';
import type { FiatCode } from './assets';

type MagicStatus = 'error' | 'refunded' | 'expired' | 'too_small' | 'too_large' | 'no_market';

/**
 * Cents that force a terminal outcome, so integrators can exercise every failure path. Matching on the cents
 * instead of whole amounts keeps them usable inside any min/max an operator sets. Published in /docs.
 */
const MAGIC_CENTS: { cents: string; status: MagicStatus; label: string }[] = [
  { cents: '13', status: 'error', label: 'anchor error' },
  { cents: '66', status: 'refunded', label: 'refund' },
  { cents: '77', status: 'expired', label: 'expiration' },
  { cents: '11', status: 'too_small', label: 'too_small' },
  { cents: '99', status: 'too_large', label: 'too_large' },
  { cents: '55', status: 'no_market', label: 'no_market' },
];

/** A whole amount inside the default limits, to show each magic ending on. */
const EXAMPLE_BASE: Record<FiatCode, string> = { ARS: '2000', PEN: '5', COP: '5000' };

export interface MagicAmount {
  cents: string;
  status: MagicStatus;
  message: string;
  example: string;
}

export function magicAmounts(code: FiatCode): MagicAmount[] {
  return MAGIC_CENTS.map(({ cents, status, label }) => ({
    cents,
    status,
    message: `Simulated ${label} (amount ending in .${cents}).`,
    example: `${EXAMPLE_BASE[code]}.${cents}`,
  }));
}

/** The outcome forced by the cents of `amountIn`, or null. Amounts with more than 2 decimals never match. */
export function magicOutcome(code: FiatCode, amountIn: string): MagicAmount | null {
  const fraction = toStroops(amountIn) % 10_000_000n;
  if (fraction % 100_000n !== 0n) return null;
  const cents = (fraction / 100_000n).toString().padStart(2, '0');
  return magicAmounts(code).find((m) => m.cents === cents) ?? null;
}
