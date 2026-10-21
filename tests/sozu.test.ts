import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  leadingZeroBits,
  parseNextAvailableAt,
  powDigest,
  PowTimeoutError,
  requestSozuClaim,
  solvePow,
} from '@/lib/liquidity/sozu';

// Independent bit count over the raw digest bytes, to check the hex-based one against.
function zeroBitsOfBytes(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

const TO = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('leadingZeroBits', () => {
  it.each([
    ['ffff', 0],
    ['8000', 0],
    ['7fff', 1],
    ['3fff', 2],
    ['1fff', 3],
    ['0fff', 4],
    ['00ff', 8],
    ['0001', 15],
    ['0000', 16],
  ])('%s has %i leading zero bits', (hex, bits) => {
    expect(leadingZeroBits(hex)).toBe(bits);
  });

  it('matches a byte-level count on real digests', () => {
    for (let i = 0; i < 2000; i++) {
      const digest = createHash('sha256').update(`x${i}`).digest();
      expect(leadingZeroBits(digest.toString('hex'))).toBe(zeroBitsOfBytes(digest));
    }
  });
});

describe('solvePow', () => {
  it('returns the smallest nonce meeting the difficulty, over prefix:challengeId:to:nonce', async () => {
    const input = { prefix: 'sozu-faucet-v1', challengeId: 'abc123', to: TO, difficulty: 10 };
    const nonce = await solvePow(input);
    const digest = createHash('sha256').update(`sozu-faucet-v1:abc123:${TO}:${nonce}`).digest();
    expect(powDigest({ ...input, nonce })).toBe(digest.toString('hex'));
    expect(zeroBitsOfBytes(digest)).toBeGreaterThanOrEqual(10);
    for (let n = 0; n < Number(nonce); n++) {
      expect(leadingZeroBits(powDigest({ ...input, nonce: String(n) }))).toBeLessThan(10);
    }
  });

  it('gives up after the timeout', async () => {
    await expect(solvePow({ prefix: 'p', challengeId: 'c', to: TO, difficulty: 256, timeoutMs: 20 })).rejects.toBeInstanceOf(
      PowTimeoutError,
    );
  });
});

describe('parseNextAvailableAt', () => {
  it('accepts ISO strings, epoch seconds and epoch milliseconds', () => {
    expect(parseNextAvailableAt('2026-10-21T10:00:00.000Z')?.toISOString()).toBe('2026-10-21T10:00:00.000Z');
    expect(parseNextAvailableAt(1_792_576_800)?.getTime()).toBe(1_792_576_800_000);
    expect(parseNextAvailableAt(1_792_576_800_000)?.getTime()).toBe(1_792_576_800_000);
    expect(parseNextAvailableAt('nope')).toBeNull();
    expect(parseNextAvailableAt(undefined)).toBeNull();
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('requestSozuClaim', () => {
  const challenge = { challengeId: 'ch-1', prefix: 'sozu-faucet-v1', to: TO, difficulty: 8 };

  it('solves the challenge and claims', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, challenge))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, amount: 100, txHash: 'abc' }));
    const out = await requestSozuClaim({ to: TO, url: 'https://faucet.test/', fetchImpl });

    expect(out).toMatchObject({ ok: true, amount: '100', txHash: 'abc', reason: null });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://faucet.test/api/v1/faucet/pow/challenge');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ to: TO });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://faucet.test/api/v1/faucet/claim');
    const claimBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(claimBody.to).toBe(TO);
    expect(claimBody.pow.challengeId).toBe('ch-1');
    expect(leadingZeroBits(powDigest({ ...challenge, nonce: claimBody.pow.nonce }))).toBeGreaterThanOrEqual(8);
  });

  it('reports a cooldown with its next available time', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, challenge))
      .mockResolvedValueOnce(
        jsonResponse(429, { success: false, reason: 'user_cooldown', nextAvailableAt: '2026-10-21T10:00:00.000Z' }),
      );
    const out = await requestSozuClaim({ to: TO, url: 'https://faucet.test', fetchImpl });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('user_cooldown');
    expect(out.nextAvailableAt?.toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });

  it('stops when the challenge is refused', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(400, { reason: 'trustline_required', error: 'no trust' }));
    const out = await requestSozuClaim({ to: TO, fetchImpl });
    expect(out).toMatchObject({ ok: false, reason: 'trustline_required', error: 'no trust' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws on a non-JSON answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('<!doctype html>', { status: 404 }));
    await expect(requestSozuClaim({ to: TO, fetchImpl })).rejects.toThrow(/not JSON/);
  });
});
