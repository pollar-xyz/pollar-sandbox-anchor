import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();

vi.mock('@/lib/db', () => ({
  db: () => ({ anchorAccount: { findUnique }, sozuClaim: { findFirst, create } }),
}));
vi.mock('@/lib/env', () => ({
  env: () => ({
    SOZU_FAUCET_URL: 'https://faucet.test',
    USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  }),
}));
vi.mock('@/lib/liquidity/sozu', () => ({ requestSozuClaim: vi.fn(), SOZU_COOLDOWN_MS: 3_600_000 }));
vi.mock('@/lib/liquidity/onchain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/liquidity/onchain')>()),
  loadAccountOrNull: vi.fn(async () => ({})),
  balanceOf: vi.fn(),
}));

const { claimSozuUsdc, SOZU_RECONCILE } = await import('@/lib/liquidity');
const { requestSozuClaim } = await import('@/lib/liquidity/sozu');
const { balanceOf } = await import('@/lib/liquidity/onchain');
SOZU_RECONCILE.attempts = 2;
SOZU_RECONCILE.delayMs = 1;

const wallet = { id: 'w1', role: 'LIQUIDITY', active: true, public_key: 'GWALLET' };

describe('claimSozuUsdc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(wallet);
    vi.mocked(balanceOf).mockReturnValue('100.0000000');
  });

  it('short-circuits while the last claim is cooling down', async () => {
    const next = new Date(Date.now() + 3_600_000);
    findFirst.mockResolvedValue({ next_available_at: next });
    const out = await claimSozuUsdc('w1');
    expect(out).toEqual({ ok: false, reason: 'cooldown', nextAvailableAt: next });
    expect(requestSozuClaim).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('claims once the cooldown has passed and records it', async () => {
    findFirst.mockResolvedValue({ next_available_at: new Date(Date.now() - 1000) });
    vi.mocked(requestSozuClaim).mockResolvedValue({
      ok: true,
      amount: '100',
      txHash: 'hash1',
      reason: null,
      error: null,
      nextAvailableAt: null,
    });
    const out = await claimSozuUsdc('w1');
    expect(out).toEqual({ ok: true, amount: '100', txHash: 'hash1' });
    expect(requestSozuClaim).toHaveBeenCalledWith({ to: 'GWALLET', url: 'https://faucet.test' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ account_id: 'w1', status: 'success', amount: '100', tx_hash: 'hash1' }),
    });
  });

  it('applies a one hour cooldown when the faucet does not state one', async () => {
    findFirst.mockResolvedValue(null);
    vi.mocked(requestSozuClaim).mockResolvedValue({
      ok: true,
      amount: '100',
      txHash: 'hash1',
      reason: null,
      error: null,
      nextAvailableAt: null,
    });
    const before = Date.now();
    await claimSozuUsdc('w1');
    const next = vi.mocked(create).mock.calls[0]![0].data.next_available_at as Date;
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it('records a success when the claim times out but the USDC arrived', async () => {
    findFirst.mockResolvedValue(null);
    vi.mocked(balanceOf).mockReturnValueOnce('100.0000000').mockReturnValue('200.0000000');
    vi.mocked(requestSozuClaim).mockRejectedValue(new Error('The operation was aborted due to timeout'));
    const out = await claimSozuUsdc('w1');
    expect(out).toEqual({ ok: true, amount: '100.0000000', txHash: null });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'success', amount: '100.0000000', next_available_at: expect.any(Date) }),
    });
  });

  it('records a refusal with its cooldown', async () => {
    findFirst.mockResolvedValue(null);
    const next = new Date('2026-10-21T10:00:00Z');
    vi.mocked(requestSozuClaim).mockResolvedValue({
      ok: false,
      amount: null,
      txHash: null,
      reason: 'global_cooldown',
      error: 'busy',
      nextAvailableAt: next,
    });
    const out = await claimSozuUsdc('w1');
    expect(out).toEqual({ ok: false, reason: 'global_cooldown', nextAvailableAt: next });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'failed', reason: 'global_cooldown: busy', next_available_at: next }),
    });
  });

  it('records network errors', async () => {
    findFirst.mockResolvedValue(null);
    vi.mocked(requestSozuClaim).mockRejectedValue(new Error('timeout'));
    const out = await claimSozuUsdc('w1');
    expect(out).toEqual({ ok: false, reason: 'error: timeout', nextAvailableAt: null });
    expect(create).toHaveBeenCalledWith({ data: { account_id: 'w1', status: 'error', reason: 'error: timeout' } });
  });

  it('refuses accounts that are not active liquidity wallets', async () => {
    findUnique.mockResolvedValue({ ...wallet, role: 'DISTRIBUTION' });
    await expect(claimSozuUsdc('w1')).rejects.toThrow(/liquidity wallet/);
  });
});
