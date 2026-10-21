import { Keypair, NotFoundError, Transaction, WebAuth } from '@stellar/stellar-sdk';
import { decodeJwt } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const server = Keypair.random();
const loadAccount = vi.fn();

vi.mock('@/lib/accounts', () => ({
  activeKeypair: async () => server,
  requireActiveAccount: async () => ({ public_key: server.publicKey() }),
}));

vi.mock('@/lib/stellar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stellar')>()),
  horizon: () => ({ loadAccount }),
}));

vi.stubEnv('PUBLIC_URL', 'https://sandbox-anchor.example.org');
vi.stubEnv('SEP10_JWT_SECRET', 'x'.repeat(40));
vi.stubEnv('DATABASE_URL', 'postgresql://unused');
vi.stubEnv('SECRETS_ENCRYPTION_KEY', Buffer.alloc(32).toString('base64'));
vi.stubEnv('AUTH_SECRET', 'y'.repeat(40));
vi.stubEnv('AUTH_GOOGLE_ID', 'id');
vi.stubEnv('AUTH_GOOGLE_SECRET', 'secret');
vi.stubEnv('ADMIN_EMAILS', 'a@b.c');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('FRIENDBOT_URL', 'https://friendbot.stellar.org');
vi.stubEnv('SOZU_FAUCET_URL', 'https://faucet.example.org');
vi.stubEnv('USDC_ISSUER', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
vi.stubEnv('WATCHER_ENABLED', 'false');

const { buildChallenge, requireSep10, Sep10Error, signSep10Jwt, verifyChallenge, verifySep10Jwt } = await import('@/lib/sep10');
const { NETWORK_PASSPHRASE } = await import('@/lib/stellar');

function sign(xdr: string, ...keys: Keypair[]): string {
  const tx = new Transaction(xdr, NETWORK_PASSPHRASE);
  tx.sign(...keys);
  return tx.toEnvelope().toXDR('base64');
}

describe('SEP-10', () => {
  beforeEach(() => {
    loadAccount.mockReset();
    loadAccount.mockRejectedValue(new NotFoundError('not found', {}));
  });

  it('builds a challenge with the home domain and web_auth_domain ops', async () => {
    const client = Keypair.random();
    const { transaction, network_passphrase } = await buildChallenge({ account: client.publicKey() });
    expect(network_passphrase).toBe('Test SDF Network ; September 2015');
    const read = WebAuth.readChallengeTx(
      transaction,
      server.publicKey(),
      NETWORK_PASSPHRASE,
      'sandbox-anchor.example.org',
      'sandbox-anchor.example.org',
    );
    expect(read.clientAccountID).toBe(client.publicKey());
    const tx = new Transaction(transaction, NETWORK_PASSPHRASE);
    expect(tx.source).toBe(server.publicKey());
    expect(tx.operations.map((op) => (op.type === 'manageData' ? op.name : op.type))).toEqual([
      'sandbox-anchor.example.org auth',
      'web_auth_domain',
    ]);
  });

  it('round trips: client signs, server verifies, JWT carries the account', async () => {
    const client = Keypair.random();
    const { transaction } = await buildChallenge({ account: client.publicKey() });
    const claims = await verifyChallenge(sign(transaction, client));
    expect(claims.account).toBe(client.publicKey());

    const token = await signSep10Jwt(claims);
    const payload = decodeJwt(token);
    expect(payload.iss).toBe('https://sandbox-anchor.example.org/auth');
    expect(payload.sub).toBe(client.publicKey());
    expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);
    expect(payload.jti).toBe(claims.jti);
    expect(await verifySep10Jwt(token)).toEqual({ account: client.publicKey(), memo: null, clientDomain: null });
  });

  it('puts the memo in sub as account:memo', async () => {
    const client = Keypair.random();
    const { transaction } = await buildChallenge({ account: client.publicKey(), memo: '123' });
    const claims = await verifyChallenge(sign(transaction, client));
    expect(claims.memo).toBe('123');
    const token = await signSep10Jwt(claims);
    expect(decodeJwt(token).sub).toBe(`${client.publicKey()}:123`);
    expect((await verifySep10Jwt(token)).memo).toBe('123');
  });

  it('rejects a challenge signed by someone else when the account does not exist', async () => {
    const client = Keypair.random();
    const { transaction } = await buildChallenge({ account: client.publicKey() });
    await expect(verifyChallenge(sign(transaction, Keypair.random()))).rejects.toBeInstanceOf(Sep10Error);
  });

  it('accepts an existing account signed by a weighted signer that meets the medium threshold', async () => {
    const client = Keypair.random();
    const cosigner = Keypair.random();
    loadAccount.mockResolvedValue({
      thresholds: { low_threshold: 0, med_threshold: 2, high_threshold: 2 },
      signers: [
        { key: client.publicKey(), weight: 0, type: 'ed25519_public_key' },
        { key: cosigner.publicKey(), weight: 2, type: 'ed25519_public_key' },
      ],
    });
    const { transaction } = await buildChallenge({ account: client.publicKey() });
    expect((await verifyChallenge(sign(transaction, cosigner))).account).toBe(client.publicKey());
    await expect(verifyChallenge(sign(transaction, client))).rejects.toBeInstanceOf(Sep10Error);
  });

  it('validates the challenge request', async () => {
    await expect(buildChallenge({ account: 'nope' })).rejects.toBeInstanceOf(Sep10Error);
    await expect(buildChallenge({ account: Keypair.random().publicKey(), memo: 'abc' })).rejects.toBeInstanceOf(Sep10Error);
    await expect(
      buildChallenge({ account: Keypair.random().publicKey(), homeDomain: 'other.example.org' }),
    ).rejects.toBeInstanceOf(Sep10Error);
  });

  it('requireSep10 returns claims for a valid bearer and 403 otherwise', async () => {
    const account = Keypair.random().publicKey();
    const token = await signSep10Jwt({ account, memo: null, clientDomain: null });
    const ok = await requireSep10(new Request('http://x', { headers: { Authorization: `Bearer ${token}` } }));
    expect(ok).toEqual({ account, memo: null, clientDomain: null });

    const missing = await requireSep10(new Request('http://x'));
    expect(missing instanceof Response && missing.status).toBe(403);
    const bad = await requireSep10(new Request('http://x', { headers: { Authorization: 'Bearer abc.def.ghi' } }));
    expect(bad instanceof Response && bad.status).toBe(403);
    expect(bad instanceof Response && (await bad.json())).toEqual({ error: expect.any(String) });
  });
});
