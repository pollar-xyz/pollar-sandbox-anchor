import { createHash } from 'node:crypto';

// Client for the Sozu testnet USDC faucet, same protocol as its official CLI (@sozu/faucet):
// POST /api/v1/faucet/pow/challenge, solve the proof of work, POST /api/v1/faucet/claim.

export const DEFAULT_SOZU_URL = 'https://faucet.sozu.capital';
export const SOZU_CLAIM_AMOUNT = '100';

const HTTP_TIMEOUT_MS = 20_000;
/** The faucet answers the claim only after its payment lands on-chain, which can take well over 20s. */
const CLAIM_TIMEOUT_MS = 90_000;
/** Cooldown per recipient address observed on the faucet, used when a response does not state one. */
export const SOZU_COOLDOWN_MS = 60 * 60 * 1000;
const POW_TIMEOUT_MS = 120_000;
/** Hashes between yields to the event loop, so solving does not freeze the server. */
const POW_BATCH = 20_000;

export function leadingZeroBits(hexDigest: string): number {
  let bits = 0;
  for (const ch of hexDigest) {
    const n = Number.parseInt(ch, 16);
    if (!Number.isFinite(n)) return bits;
    if (n === 0) {
      bits += 4;
      continue;
    }
    return bits + Math.clz32(n) - 28;
  }
  return bits;
}

export function powDigest(input: { prefix: string; challengeId: string; to: string; nonce: string }): string {
  return createHash('sha256').update(`${input.prefix}:${input.challengeId}:${input.to}:${input.nonce}`).digest('hex');
}

export class PowTimeoutError extends Error {
  constructor(readonly attempts: number) {
    super(`Proof of work not solved after ${attempts} hashes`);
  }
}

/** Smallest decimal nonce whose digest has at least `difficulty` leading zero bits. */
export async function solvePow(input: {
  prefix: string;
  challengeId: string;
  to: string;
  difficulty: number;
  timeoutMs?: number;
}): Promise<string> {
  const deadline = Date.now() + (input.timeoutMs ?? POW_TIMEOUT_MS);
  for (let nonce = 0; ; nonce++) {
    const candidate = String(nonce);
    if (leadingZeroBits(powDigest({ ...input, nonce: candidate })) >= input.difficulty) return candidate;
    if (nonce % POW_BATCH === POW_BATCH - 1) {
      if (Date.now() > deadline) throw new PowTimeoutError(nonce + 1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

export interface SozuOutcome {
  ok: boolean;
  amount: string | null;
  txHash: string | null;
  reason: string | null;
  error: string | null;
  nextAvailableAt: Date | null;
}

interface ChallengeBody {
  challengeId?: string;
  prefix?: string;
  to?: string;
  difficulty?: number;
  error?: string;
  reason?: string;
}

interface ClaimBody {
  success?: boolean;
  amount?: number | string;
  txHash?: string;
  hash?: string;
  transactionHash?: string;
  error?: string;
  reason?: string;
  nextAvailableAt?: string | number;
  retryAfter?: number;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function postJson<T>(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  timeoutMs = HTTP_TIMEOUT_MS,
): Promise<{ status: number; ok: boolean; body: T }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new Error(`Sozu ${url} returned HTTP ${res.status}, not JSON: ${text.slice(0, 200)}`);
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

/** Accepts an ISO date, epoch seconds or epoch milliseconds. */
export function parseNextAvailableAt(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === 'string' && value.trim()) {
    if (/^\d+$/.test(value.trim())) return parseNextAvailableAt(Number(value));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function failure(body: { error?: string; reason?: string; nextAvailableAt?: unknown; retryAfter?: unknown }, status: number) {
  let next = parseNextAvailableAt(body.nextAvailableAt);
  if (!next && typeof body.retryAfter === 'number') next = new Date(Date.now() + body.retryAfter * 1000);
  return {
    ok: false,
    amount: null,
    txHash: null,
    reason: body.reason ?? `http_${status}`,
    error: body.error ?? null,
    nextAvailableAt: next,
  } satisfies SozuOutcome;
}

/** Runs one full claim against the faucet. Network and protocol errors throw; faucet refusals return ok=false. */
export async function requestSozuClaim(input: {
  to: string;
  url?: string;
  fetchImpl?: FetchLike;
  powTimeoutMs?: number;
}): Promise<SozuOutcome> {
  const base = (input.url ?? DEFAULT_SOZU_URL).replace(/\/$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;

  const challenge = await postJson<ChallengeBody>(fetchImpl, `${base}/api/v1/faucet/pow/challenge`, { to: input.to });
  if (!challenge.ok) return failure(challenge.body, challenge.status);
  const { challengeId, prefix, to, difficulty } = challenge.body;
  if (!challengeId || !prefix || !to || typeof difficulty !== 'number') {
    throw new Error(`Sozu challenge is missing fields: ${JSON.stringify(challenge.body).slice(0, 200)}`);
  }

  const nonce = await solvePow({ prefix, challengeId, to, difficulty, timeoutMs: input.powTimeoutMs });

  const claim = await postJson<ClaimBody>(
    fetchImpl,
    `${base}/api/v1/faucet/claim`,
    { to, pow: { challengeId, nonce } },
    CLAIM_TIMEOUT_MS,
  );
  if (!claim.ok || claim.body.success !== true) return failure(claim.body, claim.status);
  return {
    ok: true,
    amount: claim.body.amount !== undefined ? String(claim.body.amount) : SOZU_CLAIM_AMOUNT,
    txHash: claim.body.txHash ?? claim.body.hash ?? claim.body.transactionHash ?? null,
    reason: null,
    error: null,
    nextAvailableAt: parseNextAvailableAt(claim.body.nextAvailableAt),
  };
}
