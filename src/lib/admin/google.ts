import { createRemoteJWKSet, jwtVerify } from 'jose';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
// Google signs id_tokens with either form of the issuer.
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function exchangeCode(input: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      code_verifier: input.verifier,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!res.ok || typeof body.id_token !== 'string') {
    throw new Error(`Google token exchange failed (${res.status}${typeof body.error === 'string' ? `: ${body.error}` : ''})`);
  }
  return body.id_token;
}

export async function verifyIdToken(idToken: string, clientId: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, JWKS, { issuer: ISSUERS, audience: clientId });
  if (typeof payload.email !== 'string') throw new Error('id_token without email');
  return {
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
  };
}
