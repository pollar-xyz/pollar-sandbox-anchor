// Manual smoke test of the on-chain liquidity helpers against Stellar testnet. No database needed.
// Run: pnpm dlx tsx scripts/smoke-liquidity.mts
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

// tsx loads src/ as CommonJS, so take the SDK from the same CommonJS instance: instanceof checks fail across the two.
const { Asset, Keypair } = createRequire(import.meta.url)('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk');

// env() validates every variable, so fill the ones this script never touches with placeholders.
const defaults: Record<string, string> = {
  DATABASE_URL: 'postgresql://unused',
  PUBLIC_URL: 'http://localhost:3080',
  SECRETS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SEP10_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_SECRET: randomBytes(32).toString('hex'),
  AUTH_GOOGLE_ID: 'unused',
  AUTH_GOOGLE_SECRET: 'unused',
  ADMIN_EMAILS: 'unused@example.com',
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  FRIENDBOT_URL: 'https://friendbot.stellar.org',
  SOZU_FAUCET_URL: 'https://faucet.sozu.capital',
  USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  WATCHER_ENABLED: 'false',
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;

const onchain = await import('../src/lib/liquidity/onchain');
const { offerPrice } = await import('../src/lib/liquidity/pricing');
const { sendPayment } = await import('../src/lib/payments');

const issuer = Keypair.random();
const holder = Keypair.random();
const tst = new Asset('TST', issuer.publicKey());
const friendbot = process.env.FRIENDBOT_URL!;

console.log('issuer', issuer.publicKey());
console.log('holder', holder.publicKey());

console.log('funded issuer:', await onchain.fundWithFriendbot(issuer.publicKey(), friendbot));
console.log('funded holder:', await onchain.fundWithFriendbot(holder.publicKey(), friendbot));
console.log('fund again (expect false):', await onchain.fundWithFriendbot(holder.publicKey(), friendbot));

console.log('home_domain tx:', await onchain.ensureHomeDomain(issuer, 'sandbox-anchor.example.org'));
console.log('home_domain again (expect null):', await onchain.ensureHomeDomain(issuer, 'sandbox-anchor.example.org'));

console.log('trustline tx:', await onchain.ensureTrustlines(holder, [tst]));
console.log('trustline again (expect null):', await onchain.ensureTrustlines(holder, [tst]));

console.log('payment tx:', await sendPayment({ from: issuer, to: holder.publicKey(), asset: tst, amount: '1000' }));

const rates = { ARS: '1450', PEN: '3.7', XLM: '4', spread_bps: 100 };
const price = offerPrice(rates, 'ARS', 'XLM');
console.log('offer tx:', await onchain.replaceOffers(holder, [{ selling: tst, buying: Asset.native(), amount: '400', price }]));
console.log('offers:', await onchain.listOffers(holder.publicKey()));

console.log(
  'replace tx:',
  await onchain.replaceOffers(holder, [{ selling: tst, buying: Asset.native(), amount: '300', price }]),
);
const offers = await onchain.listOffers(holder.publicKey());
console.log('offers after replace:', offers);
// The network rounds an offer down so it trades exactly at its rational price, hence the tolerance.
if (offers.length !== 1 || Math.abs(Number(offers[0].amount) - 300) > 0.001) throw new Error('replaceOffers did not replace');

const account = await onchain.loadAccountOrNull(holder.publicKey());
console.log('balances:', account && onchain.balancesOf(account));
console.log('missing account:', await onchain.loadAccountOrNull(Keypair.random().publicKey()));
console.log('OK');
