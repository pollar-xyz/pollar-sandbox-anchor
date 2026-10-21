import type { AccountRole, AnchorAccount, SozuClaim } from '@prisma/client';
import type { FiatCode } from '../assets';

// Contract for anchor bootstrap and DEX liquidity (F2, F3), used by the admin (F7).

export interface Balance {
  asset: string; // 'XLM' or CODE:ISSUER
  balance: string;
}

export interface AccountStatus {
  account: AnchorAccount;
  exists: boolean;
  balances: Balance[];
}

export interface OfferSummary {
  id: string;
  selling: string;
  buying: string;
  amount: string;
  price: string;
}

export interface LiquidityStatus {
  generation: number;
  accounts: AccountStatus[];
  offers: OfferSummary[];
  usdcAvailable: string;
  usdcBelowThreshold: boolean;
  lastSozuClaim: SozuClaim | null;
}

export type SozuClaimResult =
  { ok: true; amount: string; txHash: string | null } | { ok: false; reason: string; nextAvailableAt: Date | null };

function notImplemented(): never {
  throw new Error('Not implemented yet (DEV-137 / DEV-138)');
}

/** Creates and funds whatever core account is missing in the current generation. Idempotent. */
export async function bootstrap(_actor: string): Promise<AnchorAccount[]> {
  notImplemented();
}

/** After a testnet reset: retires the current generation and bootstraps a new one, liquidity included. */
export async function rebootstrap(_actor: string): Promise<AnchorAccount[]> {
  notImplemented();
}

export async function createLiquidityWallet(_actor: string, _label?: string): Promise<AnchorAccount> {
  notImplemented();
}

export async function mintToLiquidity(_accountId: string, _asset: FiatCode, _amount: string): Promise<string> {
  notImplemented();
}

export async function claimSozuUsdc(_accountId: string): Promise<SozuClaimResult> {
  notImplemented();
}

/** Replaces the offers of one liquidity wallet (or all) using settings.rates. */
export async function publishOffers(_accountId?: string): Promise<OfferSummary[]> {
  notImplemented();
}

export async function getLiquidityStatus(): Promise<LiquidityStatus> {
  notImplemented();
}

export async function getAccountStatus(_role?: AccountRole): Promise<AccountStatus[]> {
  notImplemented();
}
