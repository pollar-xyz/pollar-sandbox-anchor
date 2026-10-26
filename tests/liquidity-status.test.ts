import { Asset, Keypair } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USDC_ISSUER = Keypair.random().publicKey();
const ARS_ISSUER = Keypair.random().publicKey();
const PEN_ISSUER = Keypair.random().publicKey();

const account = (id: string, role: string, active = true) => ({
  id,
  role,
  active,
  public_key: Keypair.random().publicKey(),
  generation: 2,
});
const accounts = [
  account('d', 'DISTRIBUTION'),
  account('l1', 'LIQUIDITY'),
  account('l2', 'LIQUIDITY'),
  account('l3', 'LIQUIDITY'),
];

const sozuFindFirst = vi.fn();
const replaceOffers = vi.fn();

vi.mock('@/lib/env', () => ({ env: () => ({ USDC_ISSUER }) }));
vi.mock('@/lib/db', () => ({
  db: () => ({
    sozuClaim: { findFirst: sozuFindFirst },
    anchorAccount: { findUnique: async ({ where }: { where: { id: string } }) => accounts.find((a) => a.id === where.id) },
  }),
}));
vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({
    rates: { ARS: '1450', PEN: '3.7', XLM: '4', spread_bps: 100 },
    usdc_alert_threshold: '200',
    max_usdc_per_offer: '1000000',
  }),
}));
vi.mock('@/lib/accounts', () => ({
  currentGeneration: async () => 2,
  listActiveAccounts: async (role?: string) => accounts.filter((a) => !role || a.role === role),
  getActiveAccount: async () => null,
  keypairOf: () => Keypair.random(),
  storeAccount: vi.fn(),
}));
vi.mock('@/lib/assets', async (orig) => ({
  ...(await orig<typeof import('@/lib/assets')>()),
  fiatAsset: async (code: 'ARS' | 'PEN') => new Asset(code, code === 'ARS' ? ARS_ISSUER : PEN_ISSUER),
}));

function fakeAccount(balances: Array<{ code?: string; issuer?: string; balance: string }>) {
  return {
    balances: balances.map((b) =>
      b.code
        ? { asset_type: 'credit_alphanum4', asset_code: b.code, asset_issuer: b.issuer, balance: b.balance }
        : { asset_type: 'native', balance: b.balance },
    ),
  };
}

const onchain: Record<string, ReturnType<typeof fakeAccount> | null> = {
  [accounts[0].public_key]: fakeAccount([{ balance: '9999' }]),
  [accounts[1].public_key]: fakeAccount([
    { balance: '10000' },
    { code: 'USDC', issuer: USDC_ISSUER, balance: '120.5' },
    { code: 'ARS', issuer: ARS_ISSUER, balance: '1000' },
  ]),
  [accounts[2].public_key]: fakeAccount([{ balance: '10000' }, { code: 'USDC', issuer: USDC_ISSUER, balance: '30' }]),
  [accounts[3].public_key]: null,
};

vi.mock('@/lib/liquidity/onchain', async (orig) => {
  const real = await orig<typeof import('@/lib/liquidity/onchain')>();
  return {
    ...real,
    loadAccountOrNull: async (pk: string) => onchain[pk] ?? null,
    listOffers: async (pk: string) => [{ id: pk.slice(0, 4), selling: 'XLM', buying: 'X', amount: '1', price: '1' }],
    replaceOffers,
  };
});

const { getLiquidityStatus, getAccountStatus, publishOffers, checkDepth } = await import('@/lib/liquidity');

describe('liquidity status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sozuFindFirst.mockResolvedValue({ id: 'claim1' });
  });

  it('reports balances, existence and USDC across liquidity wallets', async () => {
    const status = await getLiquidityStatus();
    expect(status.generation).toBe(2);
    expect(status.accounts).toHaveLength(4);
    expect(status.accounts.find((a) => a.account.id === 'l3')).toMatchObject({ exists: false, balances: [] });
    expect(status.accounts.find((a) => a.account.id === 'l1')?.balances).toContainEqual({
      asset: `USDC:${USDC_ISSUER}`,
      balance: '120.5',
    });
    expect(status.usdcAvailable).toBe('150.5000000');
    expect(status.usdcBelowThreshold).toBe(true);
    expect(status.offers).toHaveLength(2);
    expect(status.lastSozuClaim).toEqual({ id: 'claim1' });
    expect(sozuFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { account_id: { in: ['l1', 'l2', 'l3'] } } }));
  });

  it('filters by role', async () => {
    const out = await getAccountStatus('DISTRIBUTION' as never);
    expect(out.map((a) => a.account.id)).toEqual(['d']);
  });

  it('publishes offers sized from each wallet and skips missing ones', async () => {
    await publishOffers();
    expect(replaceOffers).toHaveBeenCalledTimes(2);
    const plans = replaceOffers.mock.calls[0][1] as Array<{ selling: Asset; buying: Asset; amount: string }>;
    // l1 holds XLM, USDC and ARS but no PEN trustline.
    expect(plans.every((p) => p.selling.getCode() !== 'PEN' && p.buying.getCode() !== 'PEN')).toBe(true);
    expect(plans.find((p) => p.selling.getCode() === 'ARS' && p.buying.isNative())?.amount).toBe('450.0000000');
  });

  it('warns about missing accounts, low USDC and missing offers', async () => {
    const warnings = await checkDepth();
    expect(warnings.some((w) => w.includes('does not exist on-chain'))).toBe(true);
    expect(warnings.some((w) => w.includes('USDC across liquidity wallets is low'))).toBe(true);
    expect(warnings).toContain('No offer selling ARS for XLM');
  });
});
