import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();

vi.mock('@/lib/db', () => ({
  db: () => ({ anchorAccount: { findUnique }, sozuClaim: { findFirst, create } }),
}));
vi.mock('@/lib/env', () => ({ env: () => ({ SOZU_FAUCET_URL: 'https://faucet.test' }) }));
vi.mock('@/lib/liquidity/sozu', () => ({ requestSozuClaim: vi.fn() }));

const { claimSozuUsdc } = await import('@/lib/liquidity');
const { requestSozuClaim } = await import('@/lib/liquidity/sozu');

const wallet = { id: 'w1', role: 'LIQUIDITY', active: true, public_key: 'GWALLET' };

describe('claimSozuUsdc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(wallet);
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
