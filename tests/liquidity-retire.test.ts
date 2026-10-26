import { Asset, Keypair, type xdr } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USDC_ISSUER = Keypair.random().publicKey();
const ARS_ISSUER = Keypair.random().publicKey();

const wallet = (id: string) => ({
  id,
  role: 'LIQUIDITY',
  active: true,
  public_key: Keypair.random().publicKey(),
  generation: 1,
});
const from = wallet('from');
const to = wallet('to');

const update = vi.fn();
const submitOperations = vi.fn();
const ensureTrustlines = vi.fn();
const replaceOffers = vi.fn();
let onchainFrom: unknown;

vi.mock('@/lib/env', () => ({ env: () => ({ USDC_ISSUER }) }));
vi.mock('@/lib/db', () => ({
  db: () => ({
    anchorAccount: {
      findUnique: async ({ where }: { where: { id: string } }) => [from, to].find((a) => a.id === where.id),
      update,
    },
  }),
}));
vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({ rates: { ARS: '1450', PEN: '3.7', COP: '4000', XLM: '4', spread_bps: 100 } }),
}));
vi.mock('@/lib/accounts', () => ({
  currentGeneration: async () => 1,
  listActiveAccounts: async () => [],
  getActiveAccount: async () => null,
  keypairOf: () => Keypair.random(),
  storeAccount: vi.fn(),
}));
vi.mock('@/lib/assets', async (orig) => ({
  ...(await orig<typeof import('@/lib/assets')>()),
  fiatAsset: async (code: string) => new Asset(code, ARS_ISSUER),
}));
vi.mock('@/lib/payments', () => ({ submitOperations, sendPayment: vi.fn() }));
vi.mock('@/lib/liquidity/onchain', async (orig) => ({
  ...(await orig<typeof import('@/lib/liquidity/onchain')>()),
  loadAccountOrNull: async (pk: string) => (pk === from.public_key ? onchainFrom : { balances: [] }),
  listOfferRecords: async () => [
    {
      id: '7',
      selling: { asset_type: 'native' },
      buying: { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER },
      price_r: { n: 1, d: 4 },
    },
  ],
  listOffers: async () => [],
  ensureTrustlines,
  replaceOffers,
}));

const { retireLiquidityWallet } = await import('@/lib/liquidity');

function opTypes(): string[] {
  return (submitOperations.mock.calls[0][1] as xdr.Operation[]).map((op) => op.body().switch().name);
}

beforeEach(() => {
  for (const fn of [update, submitOperations, ensureTrustlines, replaceOffers]) fn.mockReset();
  submitOperations.mockResolvedValue('merge-hash');
  onchainFrom = {
    balances: [
      { asset_type: 'native', balance: '5000' },
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER, balance: '281.5' },
      { asset_type: 'credit_alphanum4', asset_code: 'ARS', asset_issuer: ARS_ISSUER, balance: '0.0000000' },
    ],
  };
});

describe('retireLiquidityWallet', () => {
  it('cancels offers, pays every non-empty asset, drops trustlines and merges in one transaction', async () => {
    const result = await retireLiquidityWallet('from', 'to', 'test');
    expect(result.txHash).toBe('merge-hash');
    expect(submitOperations).toHaveBeenCalledTimes(1);
    expect(opTypes()).toEqual(['manageSellOffer', 'payment', 'changeTrust', 'changeTrust', 'accountMerge']);
    expect(ensureTrustlines.mock.calls[0][1].map((a: Asset) => a.getCode())).toEqual(['USDC', 'ARS']);
    expect(update).toHaveBeenCalledWith({ where: { id: 'from' }, data: { active: false } });
    expect(replaceOffers).toHaveBeenCalledTimes(1);
  });

  it('only deactivates a wallet that no longer exists on-chain', async () => {
    onchainFrom = null;
    const result = await retireLiquidityWallet('from', 'to', 'test');
    expect(result.txHash).toBeNull();
    expect(submitOperations).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 'from' }, data: { active: false } });
  });

  it('keeps the wallet active when the transaction fails', async () => {
    submitOperations.mockRejectedValue(new Error('tx_failed'));
    await expect(retireLiquidityWallet('from', 'to', 'test')).rejects.toThrow('tx_failed');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to retire a wallet into itself', async () => {
    await expect(retireLiquidityWallet('from', 'from', 'test')).rejects.toThrow(/same/);
  });
});
