import { AccountRole } from '@prisma/client';
import { NotFoundError, StrKey, WebAuth } from '@stellar/stellar-sdk';
import { jwtVerify, SignJWT } from 'jose';
import { NextResponse } from 'next/server';
import { activeKeypair, requireActiveAccount } from './accounts';
import { env } from './env';
import { homeDomain, horizon, NETWORK_PASSPHRASE, publicUrl } from './stellar';

const CHALLENGE_TIMEOUT_SECONDS = 15 * 60;
const JWT_TTL_SECONDS = 24 * 60 * 60;

export class Sep10Error extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'Sep10Error';
  }
}

export interface Sep10Claims {
  account: string;
  memo: string | null;
  clientDomain: string | null;
}

export interface ChallengeRequest {
  account: string | null;
  memo?: string | null;
  homeDomain?: string | null;
  clientDomain?: string | null;
}

/**
 * Builds a SEP-10 challenge. client_domain is accepted but not attested: proving it requires fetching
 * the client's stellar.toml and adding a manageData op its signing key must sign, which a public
 * sandbox does not need. The JWT therefore never carries client_domain for challenges built here.
 */
export async function buildChallenge(req: ChallengeRequest): Promise<{ transaction: string; network_passphrase: string }> {
  const account = req.account?.trim();
  if (!account || !StrKey.isValidEd25519PublicKey(account)) throw new Sep10Error('account must be a valid G... address');
  const memo = req.memo?.trim() || null;
  if (memo !== null && !/^\d{1,20}$/.test(memo)) throw new Sep10Error('memo must be an id memo (unsigned 64-bit integer)');
  const domain = homeDomain();
  if (req.homeDomain && req.homeDomain !== domain) throw new Sep10Error(`home_domain must be ${domain}`);

  const transaction = WebAuth.buildChallengeTx(
    await activeKeypair(AccountRole.SIGNING),
    account,
    domain,
    CHALLENGE_TIMEOUT_SECONDS,
    NETWORK_PASSPHRASE,
    domain,
    memo,
  );
  return { transaction, network_passphrase: NETWORK_PASSPHRASE };
}

/** Verifies a signed challenge and returns the claims to put in the JWT. */
export async function verifyChallenge(transaction: string): Promise<Sep10Claims & { jti: string }> {
  if (!transaction) throw new Sep10Error('transaction is required');
  const serverKey = (await requireActiveAccount(AccountRole.SIGNING)).public_key;
  const domain = homeDomain();

  let read: ReturnType<typeof WebAuth.readChallengeTx>;
  try {
    read = WebAuth.readChallengeTx(transaction, serverKey, NETWORK_PASSPHRASE, domain, domain);
  } catch (err) {
    throw new Sep10Error(errorMessage(err));
  }
  const { clientAccountID, memo, tx } = read;

  const clientDomainOp = tx.operations.find((op) => op.type === 'manageData' && op.name === 'client_domain');
  const clientDomain =
    clientDomainOp && clientDomainOp.type === 'manageData' && clientDomainOp.value ? clientDomainOp.value.toString() : null;

  try {
    const signers = await loadSigners(clientAccountID);
    if (signers) {
      WebAuth.verifyChallengeTxThreshold(
        transaction,
        serverKey,
        NETWORK_PASSPHRASE,
        signers.threshold,
        signers.list,
        domain,
        domain,
      );
    } else {
      // SEP-10: an account that does not exist yet can only prove control with its own master key.
      WebAuth.verifyChallengeTxSigners(transaction, serverKey, NETWORK_PASSPHRASE, [clientAccountID], domain, domain);
    }
  } catch (err) {
    if (err instanceof Sep10Error) throw err;
    throw new Sep10Error(errorMessage(err));
  }

  return { account: clientAccountID, memo, clientDomain, jti: tx.hash().toString('hex') };
}

async function loadSigners(
  account: string,
): Promise<{ threshold: number; list: { key: string; weight: number; type: string; sponsor?: string }[] } | null> {
  try {
    const record = await horizon().loadAccount(account);
    return { threshold: record.thresholds.med_threshold, list: record.signers };
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw new Sep10Error('Could not load the account from Horizon', 503);
  }
}

function jwtKey(): Uint8Array {
  return new TextEncoder().encode(env().SEP10_JWT_SECRET);
}

export async function signSep10Jwt(claims: Sep10Claims & { jti?: string }): Promise<string> {
  const sub = claims.memo ? `${claims.account}:${claims.memo}` : claims.account;
  const jwt = new SignJWT(claims.clientDomain ? { client_domain: claims.clientDomain } : {})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(publicUrl('/auth'))
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS);
  if (claims.jti) jwt.setJti(claims.jti);
  return jwt.sign(jwtKey());
}

export async function verifySep10Jwt(token: string): Promise<Sep10Claims> {
  const { payload } = await jwtVerify(token, jwtKey(), { issuer: publicUrl('/auth'), algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string') throw new Error('Malformed token');
  const [account, memo] = payload.sub.split(':');
  if (!StrKey.isValidEd25519PublicKey(account)) throw new Error('Malformed token subject');
  return {
    account,
    memo: memo ?? null,
    clientDomain: typeof payload.client_domain === 'string' ? payload.client_domain : null,
  };
}

/** Returns the SEP-10 claims of the request, or a 403 response that the route returns as is. */
export async function requireSep10(request: Request): Promise<Sep10Claims | NextResponse> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return NextResponse.json({ error: 'Missing Authorization: Bearer <SEP-10 token>' }, { status: 403 });
  try {
    return await verifySep10Jwt(match[1]);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired SEP-10 token' }, { status: 403 });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
