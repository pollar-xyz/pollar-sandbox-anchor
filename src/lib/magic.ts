import { toStroops } from './amount';

/**
 * Amounts that force a terminal outcome, so integrators can exercise every failure path.
 * All of them sit inside both ARS and PEN limits. Published in /docs.
 */
export const MAGIC_AMOUNTS = {
  '13.13': { status: 'error', message: 'Simulated anchor error (magic amount 13.13).' },
  '66.60': { status: 'refunded', message: 'Simulated refund (magic amount 66.60).' },
  '77.70': { status: 'expired', message: 'Simulated expiration (magic amount 77.70).' },
  '11.11': { status: 'too_small', message: 'Simulated too_small (magic amount 11.11).' },
  '2999.99': { status: 'too_large', message: 'Simulated too_large (magic amount 2999.99).' },
  '55.55': { status: 'no_market', message: 'Simulated no_market (magic amount 55.55).' },
} as const;

export type ForcedOutcome = (typeof MAGIC_AMOUNTS)[keyof typeof MAGIC_AMOUNTS];

export function magicOutcome(amountIn: string): ForcedOutcome | null {
  const value = toStroops(amountIn);
  for (const [magic, outcome] of Object.entries(MAGIC_AMOUNTS)) {
    if (toStroops(magic) === value) return outcome;
  }
  return null;
}
