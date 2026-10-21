import { jwtVerify, SignJWT } from 'jose';
import { env } from './env';
import { publicUrl } from './stellar';

const AUDIENCE = 'interactive';
const TTL = '15m';

export interface InteractiveClaims {
  transactionId: string;
  account: string;
}

function key(): Uint8Array {
  return new TextEncoder().encode(env().SEP10_JWT_SECRET);
}

export async function signInteractiveToken(claims: InteractiveClaims): Promise<string> {
  return new SignJWT({ account: claims.account })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.transactionId)
    .setIssuer(publicUrl('/interactive'))
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifyInteractiveToken(token: string): Promise<InteractiveClaims> {
  const { payload } = await jwtVerify(token, key(), { audience: AUDIENCE, issuer: publicUrl('/interactive') });
  if (!payload.sub || typeof payload.account !== 'string') throw new Error('Malformed interactive token');
  return { transactionId: payload.sub, account: payload.account };
}

export async function interactiveUrl(claims: InteractiveClaims): Promise<string> {
  const token = await signInteractiveToken(claims);
  return publicUrl(`/interactive/${claims.transactionId}?token=${encodeURIComponent(token)}`);
}
