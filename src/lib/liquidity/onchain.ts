import { Asset, type Horizon, type Keypair, NotFoundError, Operation, type xdr } from '@stellar/stellar-sdk';
import { submitOperations } from '../payments';
import { horizon } from '../stellar';
import type { Balance, OfferSummary } from './index';

const FRIENDBOT_TIMEOUT_MS = 30_000;

export function assetKey(asset: Asset): string {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
}

export function assetFromRecord(record: { asset_type: string; asset_code?: string; asset_issuer?: string }): Asset {
  if (record.asset_type === 'native' || !record.asset_code || !record.asset_issuer) return Asset.native();
  return new Asset(record.asset_code, record.asset_issuer);
}

/** Null when the account does not exist on-chain (never funded, or wiped by a testnet reset). */
export async function loadAccountOrNull(publicKey: string): Promise<Horizon.AccountResponse | null> {
  try {
    return await horizon().loadAccount(publicKey);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

export async function accountExists(publicKey: string): Promise<boolean> {
  return (await loadAccountOrNull(publicKey)) !== null;
}

/** Funds the account with friendbot unless it already exists. Returns true when it funded it. */
export async function fundWithFriendbot(publicKey: string, friendbotUrl: string): Promise<boolean> {
  if (await accountExists(publicKey)) return false;
  const url = new URL(friendbotUrl);
  url.searchParams.set('addr', publicKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(FRIENDBOT_TIMEOUT_MS) });
  if (res.ok) return true;
  // Friendbot answers 400 when the account already exists, e.g. a concurrent call funded it first.
  if (await accountExists(publicKey)) return false;
  throw new Error(`Friendbot failed for ${publicKey}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

export function balancesOf(account: Horizon.AccountResponse): Balance[] {
  const out: Balance[] = [];
  for (const line of account.balances) {
    if (line.asset_type === 'native') out.push({ asset: 'XLM', balance: line.balance });
    else if (line.asset_type === 'credit_alphanum4' || line.asset_type === 'credit_alphanum12')
      out.push({ asset: `${line.asset_code}:${line.asset_issuer}`, balance: line.balance });
  }
  return out;
}

/** Balance of `asset`, or null when the account has no trustline to it. */
export function balanceOf(account: Horizon.AccountResponse, asset: Asset): string | null {
  const key = assetKey(asset);
  return balancesOf(account).find((b) => b.asset === key)?.balance ?? null;
}

export function hasTrustline(account: Horizon.AccountResponse, asset: Asset): boolean {
  return asset.isNative() || balanceOf(account, asset) !== null;
}

/** Adds the trustlines the account lacks, in one transaction. Returns the hash, or null when nothing was missing. */
export async function ensureTrustlines(keypair: Keypair, assets: Asset[]): Promise<string | null> {
  const account = await horizon().loadAccount(keypair.publicKey());
  const missing = assets.filter((a) => !hasTrustline(account, a));
  if (missing.length === 0) return null;
  return submitOperations(
    keypair,
    missing.map((asset) => Operation.changeTrust({ asset })),
  );
}

export async function ensureHomeDomain(keypair: Keypair, domain: string): Promise<string | null> {
  const account = await horizon().loadAccount(keypair.publicKey());
  if (account.home_domain === domain) return null;
  return submitOperations(keypair, [Operation.setOptions({ homeDomain: domain })]);
}

export function offerSummary(record: Horizon.ServerApi.OfferRecord): OfferSummary {
  return {
    id: String(record.id),
    selling: assetKey(assetFromRecord(record.selling)),
    buying: assetKey(assetFromRecord(record.buying)),
    amount: record.amount,
    price: record.price,
  };
}

export async function listOfferRecords(publicKey: string): Promise<Horizon.ServerApi.OfferRecord[]> {
  const records: Horizon.ServerApi.OfferRecord[] = [];
  let page = await horizon().offers().forAccount(publicKey).limit(200).call();
  while (page.records.length > 0) {
    records.push(...page.records);
    if (page.records.length < 200) break;
    page = await page.next();
  }
  return records;
}

export async function listOffers(publicKey: string): Promise<OfferSummary[]> {
  return (await listOfferRecords(publicKey)).map(offerSummary);
}

export interface OfferPlan {
  selling: Asset;
  buying: Asset;
  amount: string;
  /** Units of `buying` per unit of `selling`. */
  price: string;
}

export function cancelOfferOps(records: Horizon.ServerApi.OfferRecord[]): xdr.Operation[] {
  return records.map((o) =>
    Operation.manageSellOffer({
      selling: assetFromRecord(o.selling),
      buying: assetFromRecord(o.buying),
      amount: '0',
      price: o.price_r,
      offerId: String(o.id),
    }),
  );
}

/** Cancels every open offer of the account and creates `plans`, atomically. Returns the hash, or null when there was nothing to do. */
export async function replaceOffers(keypair: Keypair, plans: OfferPlan[]): Promise<string | null> {
  const existing = await listOfferRecords(keypair.publicKey());
  const ops: xdr.Operation[] = [
    ...cancelOfferOps(existing),
    ...plans.map((p) =>
      Operation.manageSellOffer({ selling: p.selling, buying: p.buying, amount: p.amount, price: p.price, offerId: '0' }),
    ),
  ];
  if (ops.length === 0) return null;
  return submitOperations(keypair, ops);
}
