import { AccountRole, type AnchorAccount, type SozuClaim } from '@prisma/client';
import { Asset, type Horizon, Keypair, Operation, type xdr } from '@stellar/stellar-sdk';
import { currentGeneration, getActiveAccount, keypairOf, listActiveAccounts, storeAccount } from '../accounts';
import { fromStroops, isValidAmount, toStroops } from '../amount';
import { FIAT_CODES, type FiatCode, fiatAsset, ISSUER_ROLE, usdcAsset } from '../assets';
import { db } from '../db';
import { env } from '../env';
import { sendPayment, submitOperations } from '../payments';
import { getSettings } from '../settings';
import { homeDomain } from '../stellar';
import {
  assetKey,
  balanceOf,
  balancesOf,
  cancelOfferOps,
  ensureHomeDomain,
  ensureTrustlines,
  fundWithFriendbot,
  listOfferRecords,
  listOffers,
  loadAccountOrNull,
  replaceOffers,
} from './onchain';
import { type BookCode, OFFER_PAIRS, planOffers } from './pricing';
import { requestSozuClaim, SOZU_COOLDOWN_MS } from './sozu';

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

export const CORE_ROLES = [
  AccountRole.SIGNING,
  AccountRole.ISSUER_ARS,
  AccountRole.ISSUER_PEN,
  AccountRole.ISSUER_COP,
  AccountRole.DISTRIBUTION,
  AccountRole.WITHDRAW,
] as const;

/** Stock DISTRIBUTION is topped up to on every bootstrap. Issuers can always mint more. */
export const DISTRIBUTION_STOCK: Record<FiatCode, string> = { ARS: '100000000', PEN: '1000000', COP: '1000000000' };

/** Default stock minted to a new liquidity wallet. */
export const LIQUIDITY_STOCK: Record<FiatCode, string> = { ARS: '50000000', PEN: '500000', COP: '500000000' };

function log(actor: string, message: string): void {
  console.info(`[liquidity] ${actor}: ${message}`);
}

async function issuerKeypair(code: FiatCode): Promise<Keypair> {
  const issuer = await getActiveAccount(ISSUER_ROLE[code]);
  if (!issuer) throw new Error(`Anchor account ${ISSUER_ROLE[code]} is not bootstrapped`);
  return keypairOf(issuer);
}

async function fiatAssets(): Promise<Record<FiatCode, Asset>> {
  const entries = await Promise.all(FIAT_CODES.map(async (code) => [code, await fiatAsset(code)] as const));
  return Object.fromEntries(entries) as Record<FiatCode, Asset>;
}

/** Pays `code` from its issuer until `holder` holds at least `target`. Returns the hash, or null when already there. */
async function topUp(holder: string, code: FiatCode, target: string): Promise<string | null> {
  const account = await loadAccountOrNull(holder);
  if (!account) throw new Error(`Account ${holder} does not exist on-chain`);
  const current = balanceOf(account, await fiatAsset(code));
  if (current === null) throw new Error(`Account ${holder} has no ${code} trustline`);
  const missing = toStroops(target) - toStroops(current);
  if (missing <= 0n) return null;
  return sendPayment({
    from: await issuerKeypair(code),
    to: holder,
    asset: await fiatAsset(code),
    amount: fromStroops(missing),
  });
}

async function bootstrapGeneration(actor: string, generation: number): Promise<AnchorAccount[]> {
  const accounts = {} as Record<AccountRole, AnchorAccount>;
  for (const role of CORE_ROLES) {
    const existing = await getActiveAccount(role);
    if (existing) {
      accounts[role] = existing;
      continue;
    }
    // Stored before funding so a failure halfway leaves a key the next run picks up instead of a lost one.
    accounts[role] = await storeAccount({ role, keypair: Keypair.random(), generation });
    log(actor, `created ${role} ${accounts[role].public_key} (generation ${generation})`);
  }

  for (const role of CORE_ROLES) {
    if (await fundWithFriendbot(accounts[role].public_key, env().FRIENDBOT_URL))
      log(actor, `funded ${role} ${accounts[role].public_key}`);
  }

  for (const code of FIAT_CODES) {
    const hash = await ensureHomeDomain(keypairOf(accounts[ISSUER_ROLE[code]]), homeDomain());
    if (hash) log(actor, `set home_domain on ${code} issuer (${hash})`);
  }

  const assets = Object.values(await fiatAssets());
  for (const role of [AccountRole.DISTRIBUTION, AccountRole.WITHDRAW] as const) {
    const hash = await ensureTrustlines(keypairOf(accounts[role]), assets);
    if (hash) log(actor, `added trustlines on ${role} (${hash})`);
  }

  for (const code of FIAT_CODES) {
    const hash = await topUp(accounts.DISTRIBUTION.public_key, code, DISTRIBUTION_STOCK[code]);
    if (hash) log(actor, `topped up DISTRIBUTION to ${DISTRIBUTION_STOCK[code]} ${code} (${hash})`);
  }

  return CORE_ROLES.map((role) => accounts[role]);
}

/** Creates and funds whatever core account is missing in the current generation. Idempotent. */
export async function bootstrap(actor: string): Promise<AnchorAccount[]> {
  return bootstrapGeneration(actor, (await currentGeneration()) || 1);
}

/** After a testnet reset: retires the current generation and bootstraps a new one, liquidity included. */
export async function rebootstrap(actor: string): Promise<AnchorAccount[]> {
  const latest = await db().anchorAccount.findFirst({ orderBy: { generation: 'desc' } });
  const generation = (latest?.generation ?? 0) + 1;
  await db().$transaction([db().anchorAccount.updateMany({ where: { active: true }, data: { active: false } })]);
  log(actor, `retired every active account, bootstrapping generation ${generation}`);

  const core = await bootstrapGeneration(actor, generation);
  const wallet = await createLiquidityWallet(actor, 'liquidity-1');
  try {
    const claim = await claimSozuUsdc(wallet.id);
    log(actor, `Sozu claim: ${JSON.stringify(claim)}`);
  } catch (err) {
    log(actor, `Sozu claim failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await publishOffers(wallet.id);
  return [...core, wallet];
}

export async function createLiquidityWallet(
  actor: string,
  label?: string,
  stock: Record<FiatCode, string> = LIQUIDITY_STOCK,
): Promise<AnchorAccount> {
  const generation = await currentGeneration();
  if (generation === 0) throw new Error('Bootstrap the anchor before creating a liquidity wallet');
  const keypair = Keypair.random();
  const account = await storeAccount({ role: AccountRole.LIQUIDITY, keypair, generation, label });
  log(actor, `created liquidity wallet ${account.public_key}`);

  await fundWithFriendbot(account.public_key, env().FRIENDBOT_URL);
  const assets = await fiatAssets();
  await ensureTrustlines(keypair, [...Object.values(assets), usdcAsset()]);
  for (const code of FIAT_CODES) {
    if (toStroops(stock[code]) > 0n) await mintToLiquidity(account.id, code, stock[code]);
  }
  return account;
}

async function requireLiquidityAccount(accountId: string): Promise<AnchorAccount> {
  const account = await db().anchorAccount.findUnique({ where: { id: accountId } });
  if (!account || account.role !== AccountRole.LIQUIDITY || !account.active) {
    throw new Error(`No active liquidity wallet with id ${accountId}`);
  }
  return account;
}

export async function mintToLiquidity(accountId: string, asset: FiatCode, amount: string): Promise<string> {
  if (!isValidAmount(amount)) throw new Error(`Invalid amount: ${amount}`);
  const account = await requireLiquidityAccount(accountId);
  const fiat = await fiatAsset(asset);
  await ensureTrustlines(keypairOf(account), [fiat]);
  return sendPayment({ from: await issuerKeypair(asset), to: account.public_key, asset: fiat, amount });
}

async function usdcBalance(publicKey: string): Promise<bigint> {
  const account = await loadAccountOrNull(publicKey);
  const balance = account ? balanceOf(account, usdcAsset()) : null;
  return balance === null ? 0n : toStroops(balance);
}

/** How long a failed claim keeps checking Horizon for the payment. Exported so tests can shorten it. */
export const SOZU_RECONCILE = { attempts: 6, delayMs: 5000 };

/** USDC that reached `publicKey` above `before`, checked a few times so a payment still in flight is seen. */
async function usdcReceived(publicKey: string, before: bigint): Promise<bigint> {
  const { attempts, delayMs } = SOZU_RECONCILE;
  for (let i = 0; i < attempts; i++) {
    const received = (await usdcBalance(publicKey)) - before;
    if (received > 0n) return received;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return 0n;
}

function cooldownFrom(next: Date | null): Date {
  return next ?? new Date(Date.now() + SOZU_COOLDOWN_MS);
}

export async function claimSozuUsdc(accountId: string): Promise<SozuClaimResult> {
  const account = await requireLiquidityAccount(accountId);
  const last = await db().sozuClaim.findFirst({ where: { account_id: account.id }, orderBy: { created_at: 'desc' } });
  if (last?.next_available_at && last.next_available_at.getTime() > Date.now()) {
    return { ok: false, reason: 'cooldown', nextAvailableAt: last.next_available_at };
  }

  const before = await usdcBalance(account.public_key);
  let outcome: Awaited<ReturnType<typeof requestSozuClaim>>;
  try {
    outcome = await requestSozuClaim({ to: account.public_key, url: env().SOZU_FAUCET_URL });
  } catch (err) {
    const reason = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
    // The faucet pays before it answers, so a timeout or dropped connection can still mean USDC arrived.
    const received = await usdcReceived(account.public_key, before);
    if (received > 0n) {
      const amount = fromStroops(received);
      const nextAvailableAt = cooldownFrom(null);
      await db().sozuClaim.create({
        data: {
          account_id: account.id,
          status: 'success',
          amount,
          reason: `confirmed on Horizon after ${reason}`.slice(0, 500),
          next_available_at: nextAvailableAt,
        },
      });
      return { ok: true, amount, txHash: null };
    }
    await db().sozuClaim.create({ data: { account_id: account.id, status: 'error', reason } });
    return { ok: false, reason, nextAvailableAt: null };
  }

  const nextAvailableAt = outcome.ok ? cooldownFrom(outcome.nextAvailableAt) : outcome.nextAvailableAt;
  await db().sozuClaim.create({
    data: {
      account_id: account.id,
      status: outcome.ok ? 'success' : 'failed',
      amount: outcome.amount,
      tx_hash: outcome.txHash,
      reason: outcome.ok ? null : [outcome.reason, outcome.error].filter(Boolean).join(': '),
      next_available_at: nextAvailableAt,
    },
  });
  if (outcome.ok) return { ok: true, amount: outcome.amount ?? '0', txHash: outcome.txHash };
  return { ok: false, reason: outcome.reason ?? 'unknown', nextAvailableAt };
}

/**
 * Moves everything one liquidity wallet holds to another and closes it, so its offers stop for good.
 * One transaction cancels its offers, pays every asset to the target, removes its trustlines and merges its XLM
 * into the target: a failure leaves the wallet as it was. The row stays, inactive, to keep its Sozu history.
 */
export async function retireLiquidityWallet(
  fromId: string,
  toId: string,
  actor: string,
): Promise<{ moved: Balance[]; txHash: string | null }> {
  if (fromId === toId) throw new Error('Source and target wallets are the same');
  const [from, to] = await Promise.all([requireLiquidityAccount(fromId), requireLiquidityAccount(toId)]);
  const onchain = await loadAccountOrNull(from.public_key);
  let txHash: string | null = null;
  let moved: Balance[] = [];
  if (onchain) {
    const fromKeypair = keypairOf(from);
    const lines = onchain.balances.filter(
      (b): b is Horizon.HorizonApi.BalanceLineAsset =>
        b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12',
    );
    const assets = lines.map((b) => new Asset(b.asset_code, b.asset_issuer));
    await ensureTrustlines(keypairOf(to), assets);

    const ops: xdr.Operation[] = [...cancelOfferOps(await listOfferRecords(from.public_key))];
    lines.forEach((line, i) => {
      if (toStroops(line.balance) > 0n) {
        ops.push(Operation.payment({ destination: to.public_key, asset: assets[i], amount: line.balance }));
      }
      ops.push(Operation.changeTrust({ asset: assets[i], limit: '0' }));
    });
    ops.push(Operation.accountMerge({ destination: to.public_key }));
    txHash = await submitOperations(fromKeypair, ops);
    moved = balancesOf(onchain);
  }
  await db().anchorAccount.update({ where: { id: from.id }, data: { active: false } });
  log(actor, `retired liquidity wallet ${from.public_key} into ${to.public_key} (${txHash ?? 'not on-chain'})`);
  await publishOffers(to.id);
  return { moved, txHash };
}

async function bookAssets(): Promise<Record<BookCode, Asset>> {
  const fiat = await fiatAssets();
  return { ...fiat, XLM: Asset.native(), USDC: usdcAsset() };
}

/** Replaces the offers of one liquidity wallet (or all) using settings.rates. */
export async function publishOffers(accountId?: string): Promise<OfferSummary[]> {
  const wallets = accountId ? [await requireLiquidityAccount(accountId)] : await listActiveAccounts(AccountRole.LIQUIDITY);
  const { rates, max_usdc_per_offer } = await getSettings();
  const assets = await bookAssets();
  const summaries: OfferSummary[] = [];
  for (const wallet of wallets) {
    const onchain = await loadAccountOrNull(wallet.public_key);
    if (!onchain) continue;
    const balances = Object.fromEntries(
      (Object.keys(assets) as BookCode[]).map((code) => [code, balanceOf(onchain, assets[code])]),
    ) as Record<BookCode, string | null>;
    await replaceOffers(keypairOf(wallet), planOffers({ rates, maxUsdcPerOffer: max_usdc_per_offer, assets, balances }));
    summaries.push(...(await listOffers(wallet.public_key)));
  }
  return summaries;
}

export async function getAccountStatus(role?: AccountRole): Promise<AccountStatus[]> {
  const accounts = await listActiveAccounts(role);
  return Promise.all(
    accounts.map(async (account) => {
      const onchain = await loadAccountOrNull(account.public_key);
      return { account, exists: onchain !== null, balances: onchain ? balancesOf(onchain) : [] };
    }),
  );
}

export async function getLiquidityStatus(): Promise<LiquidityStatus> {
  const [generation, accounts, settings] = await Promise.all([currentGeneration(), getAccountStatus(), getSettings()]);
  const liquidity = accounts.filter((a) => a.account.role === AccountRole.LIQUIDITY);

  const offers = (await Promise.all(liquidity.filter((a) => a.exists).map((a) => listOffers(a.account.public_key)))).flat();

  const usdcKey = assetKey(usdcAsset());
  let usdc = 0n;
  for (const wallet of liquidity) {
    const line = wallet.balances.find((b) => b.asset === usdcKey);
    if (line) usdc += toStroops(line.balance);
  }

  const lastSozuClaim = liquidity.length
    ? await db().sozuClaim.findFirst({
        where: { account_id: { in: liquidity.map((a) => a.account.id) } },
        orderBy: { created_at: 'desc' },
      })
    : null;

  return {
    generation,
    accounts,
    offers,
    usdcAvailable: fromStroops(usdc),
    usdcBelowThreshold: usdc < toStroops(settings.usdc_alert_threshold),
    lastSozuClaim,
  };
}

/** Human-readable problems with the DEX liquidity, for the admin to show. Empty when everything looks fine. */
export async function checkDepth(): Promise<string[]> {
  const status = await getLiquidityStatus();
  const warnings: string[] = [];
  const liquidity = status.accounts.filter((a) => a.account.role === AccountRole.LIQUIDITY);
  for (const a of status.accounts) {
    if (!a.exists) warnings.push(`${a.account.role} ${a.account.public_key} does not exist on-chain (testnet reset?)`);
  }
  if (liquidity.length === 0) warnings.push('There is no liquidity wallet');
  if (status.usdcBelowThreshold) warnings.push(`USDC across liquidity wallets is low: ${status.usdcAvailable}`);

  if (liquidity.some((a) => a.exists)) {
    const assets = await bookAssets();
    for (const [a, b] of OFFER_PAIRS) {
      for (const [selling, buying] of [
        [a, b],
        [b, a],
      ] as const) {
        const found = status.offers.some(
          (o) => o.selling === assetKey(assets[selling]) && o.buying === assetKey(assets[buying]),
        );
        if (!found) warnings.push(`No offer selling ${selling} for ${buying}`);
      }
    }
  }
  return warnings;
}
