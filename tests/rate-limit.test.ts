import { describe, expect, it } from 'vitest';
import { clientIp, limitByIp, TokenBucketLimiter } from '@/lib/rate-limit';

describe('TokenBucketLimiter', () => {
  it('allows a burst up to capacity, then asks to wait', () => {
    const limiter = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 1 });
    const t = 1_000_000;
    expect([limiter.take('a', t), limiter.take('a', t), limiter.take('a', t)]).toEqual([0, 0, 0]);
    expect(limiter.take('a', t)).toBe(1);
  });

  it('refills over time and keeps keys independent', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0.5 });
    const t = 1_000_000;
    expect(limiter.take('a', t)).toBe(0);
    expect(limiter.take('a', t)).toBe(2);
    expect(limiter.take('b', t)).toBe(0);
    expect(limiter.take('a', t + 2_000)).toBe(0);
  });

  it('prunes buckets that are full again', () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1 });
    limiter.take('a', 0);
    limiter.take('b', 0);
    limiter.prune(10_000);
    expect(limiter.size).toBe(0);
  });
});

describe('clientIp', () => {
  it('uses the entry appended by our proxy, not the client supplied one', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' } });
    expect(clientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9');
  });
});

describe('limitByIp', () => {
  it('returns 429 JSON once the IP budget is spent', async () => {
    const req = () => new Request('http://x', { headers: { 'x-real-ip': '10.0.0.77' } });
    let res = null;
    for (let i = 0; i < 500 && !res; i++) res = limitByIp(req());
    expect(res?.status).toBe(429);
    expect(res?.headers.get('retry-after')).toBeTruthy();
    expect(await res?.json()).toEqual({ error: expect.any(String) });
  });
});
