import { NextResponse } from 'next/server';

// In-memory token buckets. The sandbox runs as a single replica, so per-process state is the whole
// picture; with more replicas each one would allow its own budget.

export interface BucketConfig {
  /** Burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const MAX_KEYS = 50_000;

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(readonly config: BucketConfig) {}

  /** Takes one token. Returns 0 when allowed, otherwise the seconds until a token is available. */
  take(key: string, now = Date.now()): number {
    const { capacity, refillPerSecond } = this.config;
    const bucket = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.updatedAt) / 1000) * refillPerSecond);
    bucket.updatedAt = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.set(key, bucket, now);
      return 0;
    }
    this.set(key, bucket, now);
    return Math.ceil((1 - bucket.tokens) / refillPerSecond);
  }

  get size(): number {
    return this.buckets.size;
  }

  private set(key: string, bucket: Bucket, now: number): void {
    this.buckets.set(key, bucket);
    if (this.buckets.size > MAX_KEYS) this.prune(now);
  }

  /** Drops buckets that are already full again: forgetting them changes nothing. */
  prune(now = Date.now()): void {
    const { capacity, refillPerSecond } = this.config;
    for (const [key, b] of this.buckets) {
      if (b.tokens + ((now - b.updatedAt) / 1000) * refillPerSecond >= capacity) this.buckets.delete(key);
    }
  }
}

const globalForLimits = globalThis as unknown as { sandboxLimiters?: { ip: TokenBucketLimiter; account: TokenBucketLimiter } };

function limiters(): { ip: TokenBucketLimiter; account: TokenBucketLimiter } {
  // Clients poll /transaction every 5-6 s per open ramp, so the budgets leave room for a few parallel ramps.
  globalForLimits.sandboxLimiters ??= {
    ip: new TokenBucketLimiter({ capacity: 120, refillPerSecond: 2 }),
    account: new TokenBucketLimiter({ capacity: 60, refillPerSecond: 1 }),
  };
  return globalForLimits.sandboxLimiters;
}

/**
 * The right-most X-Forwarded-For entry is the one our own reverse proxy appended, so a client cannot
 * pick its bucket by sending a forged header. Behind a second proxy layer this becomes that proxy's IP.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests, slow down' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

/** Per-IP limit. Returns a 429 response to return as is, or null. */
export function limitByIp(request: Request): NextResponse | null {
  const wait = limiters().ip.take(`ip:${clientIp(request)}`);
  return wait > 0 ? tooMany(wait) : null;
}

/** Per-account limit, applied once the account is known (SEP-10 query or JWT). */
export function limitByAccount(account: string): NextResponse | null {
  const wait = limiters().account.take(`acct:${account}`);
  return wait > 0 ? tooMany(wait) : null;
}
