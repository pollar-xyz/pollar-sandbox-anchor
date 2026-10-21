import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createPkce,
  googleAuthUrl,
  isAllowedEmail,
  pkceChallenge,
  randomToken,
  safeNextPath,
  signSession,
  stateMatches,
  verifySession,
} from '@/lib/admin/tokens';

const SECRET = 'a'.repeat(32);

describe('admin session cookie', () => {
  it('round-trips the claims', async () => {
    const token = await signSession({ email: 'ops@pollar.xyz', name: 'Ops' }, SECRET);
    expect(await verifySession(token, SECRET)).toEqual({ email: 'ops@pollar.xyz', name: 'Ops' });
  });

  it('rejects another secret, a tampered token, an empty cookie and an expired token', async () => {
    const token = await signSession({ email: 'ops@pollar.xyz' }, SECRET);
    expect(await verifySession(token, 'b'.repeat(32))).toBeNull();
    expect(await verifySession(`${token.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(await verifySession(undefined, SECRET)).toBeNull();
    const expired = await signSession({ email: 'ops@pollar.xyz' }, SECRET, 60, Math.floor(Date.now() / 1000) - 3600);
    expect(await verifySession(expired, SECRET)).toBeNull();
  });

  it('expires after 12 hours by default', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signSession({ email: 'ops@pollar.xyz' }, SECRET, undefined, now);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { exp: number };
    expect(payload.exp - now).toBe(12 * 60 * 60);
  });

  it('rejects a token signed for another audience with the same secret', async () => {
    const foreign = await new SignJWT({ email: 'ops@pollar.xyz' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('pollar-sandbox-anchor')
      .setAudience('sep10')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(foreign, SECRET)).toBeNull();
  });
});

describe('email allowlist', () => {
  const allow = ['ops@pollar.xyz', ' Dev@Pollar.xyz '];

  it('is case-insensitive and trims', () => {
    expect(isAllowedEmail('OPS@pollar.xyz', allow)).toBe(true);
    expect(isAllowedEmail('dev@pollar.xyz', allow)).toBe(true);
    expect(isAllowedEmail(' dev@POLLAR.XYZ', allow)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAllowedEmail('ops@pollar.xyz.evil.com', allow)).toBe(false);
    expect(isAllowedEmail('', allow)).toBe(false);
    expect(isAllowedEmail(undefined, allow)).toBe(false);
    expect(isAllowedEmail('ops@pollar.xyz', [])).toBe(false);
  });
});

describe('state and PKCE', () => {
  it('generates distinct url-safe tokens', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('derives the S256 challenge as base64url(sha256(verifier))', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pkceChallenge(verifier)).toBe(challenge);
  });

  it('compares state exactly', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abd')).toBe(false);
    expect(stateMatches('abc', 'abcd')).toBe(false);
    expect(stateMatches(undefined, 'abc')).toBe(false);
    expect(stateMatches('abc', null)).toBe(false);
  });

  it('builds the Google authorization URL', () => {
    const url = new URL(
      googleAuthUrl({ clientId: 'cid', redirectUri: 'https://x.test/api/admin/auth/callback', state: 's', challenge: 'c' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.test/api/admin/auth/callback');
  });

  it('only accepts admin paths as the post-login destination', () => {
    expect(safeNextPath('/admin/transacciones?status=completed')).toBe('/admin/transacciones?status=completed');
    expect(safeNextPath('https://evil.com')).toBe('/admin');
    expect(safeNextPath('//evil.com/admin')).toBe('/admin');
    expect(safeNextPath('/admin//evil.com')).toBe('/admin');
    expect(safeNextPath('/admin/login')).toBe('/admin');
    expect(safeNextPath(null)).toBe('/admin');
  });
});
