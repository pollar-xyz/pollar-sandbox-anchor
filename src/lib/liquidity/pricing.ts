import type { Asset } from '@stellar/stellar-sdk';
import { fromStroops, toStroops } from '../amount';
import type { Settings } from '../settings';
import type { OfferPlan } from './onchain';

export type BookCode = 'ARS' | 'PEN' | 'COP' | 'XLM' | 'USDC';

/** Pairs quoted by every liquidity wallet, offered in both directions. */
export const OFFER_PAIRS: ReadonlyArray<readonly [BookCode, BookCode]> = [
  ['ARS', 'XLM'],
  ['PEN', 'XLM'],
  ['COP', 'XLM'],
  ['ARS', 'USDC'],
  ['PEN', 'USDC'],
  ['COP', 'USDC'],
  ['XLM', 'USDC'],
];

/** XLM kept out of the offers so the wallet can always pay fees and its subentry reserve. */
export const XLM_FEE_RESERVE = '100';

/** Share of a balance that all offers selling that asset may lock together, in bps. */
const TOTAL_SHARE_BPS = 9_000n;
/** Cap for one direction, so the opposite direction of the same pair always fits too. */
const DIRECTION_SHARE_BPS = 4_500n;

type Rates = Settings['rates'];

function unitsPerUsdc(rates: Rates, code: BookCode): number {
  if (code === 'USDC') return 1;
  const value = Number(rates[code]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid rate for ${code}: ${rates[code]}`);
  return value;
}

/**
 * Price for selling `selling` to receive `buying`, in units of `buying` per unit of `selling`, with the spread on
 * the anchor's side. A spread of 0 is raised to 1 bp: at exactly mid the two directions of a pair would cross
 * each other and the transaction fails with op_cross_self.
 */
export function offerPrice(rates: Rates, selling: BookCode, buying: BookCode): string {
  const spread = Math.max(rates.spread_bps, 1);
  const mid = unitsPerUsdc(rates, buying) / unitsPerUsdc(rates, selling);
  return formatPrice(mid * (1 + spread / 10_000));
}

function formatPrice(value: number): string {
  const s = value.toPrecision(10);
  return s.includes('e') ? s : s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Offers for one wallet. `balances` holds the wallet's balance per code, or null when it has no trustline to it.
 * Each asset may lock at most 90% of its balance across all its directions, and 45% in any single direction.
 */
export function planOffers(input: {
  rates: Rates;
  assets: Record<BookCode, Asset>;
  balances: Record<BookCode, string | null>;
}): OfferPlan[] {
  const directions: Array<[BookCode, BookCode]> = OFFER_PAIRS.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]).filter(([s, b]) => input.balances[s] !== null && input.balances[b] !== null) as Array<[BookCode, BookCode]>;

  const count = new Map<BookCode, bigint>();
  for (const [s] of directions) count.set(s, (count.get(s) ?? 0n) + 1n);

  const plans: OfferPlan[] = [];
  for (const [selling, buying] of directions) {
    const available = availableStroops(selling, input.balances[selling]!);
    const n = count.get(selling)!;
    const shareBps = TOTAL_SHARE_BPS / n < DIRECTION_SHARE_BPS ? TOTAL_SHARE_BPS / n : DIRECTION_SHARE_BPS;
    const amount = (available * shareBps) / 10_000n;
    if (amount <= 0n) continue;
    plans.push({
      selling: input.assets[selling],
      buying: input.assets[buying],
      amount: fromStroops(amount),
      price: offerPrice(input.rates, selling, buying),
    });
  }
  return plans;
}

function availableStroops(code: BookCode, balance: string): bigint {
  const total = toStroops(balance);
  const reserved = code === 'XLM' ? toStroops(XLM_FEE_RESERVE) : 0n;
  return total > reserved ? total - reserved : 0n;
}
