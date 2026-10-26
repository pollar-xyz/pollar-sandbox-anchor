// End-to-end run against a live anchor on testnet: SEP-10, a deposit and a withdrawal, checked on-chain.
// The hosted form steps are driven through the same transition functions the pages call.
// Usage: pnpm e2e [baseUrl] [ARS|PEN|COP]   (default http://localhost:3090, ARS)
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

// Same SDK copy as src/, so instanceof checks inside the libs hold.
const require = createRequire(import.meta.url);
const sdk = require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk');
const { Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, Horizon } = sdk;

const transitions = await import('../src/lib/sep24/transitions');
const { db } = await import('../src/lib/db');

const base = (process.argv[2] ?? 'http://localhost:3090').replace(/\/$/, '');
const code = (process.argv[3] ?? 'ARS') as 'ARS' | 'PEN' | 'COP';
// COP limits start at 10000.
const depositAmount = code === 'COP' ? '20000' : '200';
const withdrawAmount = code === 'COP' ? '10000' : '100';
const horizon = new Horizon.Server(process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org');

function log(step: string, data?: unknown) {
  console.log(`[e2e] ${step}`, data === undefined ? '' : JSON.stringify(data));
}

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body as Record<string, any>;
}

async function poll(token: string, id: string, until: (s: string) => boolean, timeoutMs = 120_000) {
  const started = Date.now();
  for (;;) {
    const { transaction } = await json(
      await fetch(`${base}/transfer24/transaction?id=${id}`, { headers: { Authorization: `Bearer ${token}` } }),
    );
    if (until(transaction.status)) return transaction;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out at status ${transaction.status}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

const toml = await (await fetch(`${base}/.well-known/stellar.toml`)).text();
const issuer = toml.match(new RegExp(`code\\s*=\\s*"${code}"[\\s\\S]*?issuer\\s*=\\s*"(G[A-Z0-9]{55})"`))?.[1];
if (!issuer) throw new Error(`No ${code} issuer in stellar.toml`);
const asset = new Asset(code, issuer);
log('toml ok', { issuer });

const user = Keypair.random();
await fetch(`https://friendbot.stellar.org?addr=${user.publicKey()}`);
let account = await horizon.loadAccount(user.publicKey());
const trust = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.changeTrust({ asset }))
  .setTimeout(60)
  .build();
trust.sign(user);
await horizon.submitTransaction(trust);
log('user funded with trustline', { user: user.publicKey() });

const challenge = await json(await fetch(`${base}/auth?account=${user.publicKey()}`));
const tx = TransactionBuilder.fromXDR(challenge.transaction, challenge.network_passphrase);
tx.sign(user);
const { token } = await json(
  await fetch(`${base}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: tx.toXDR() }),
  }),
);
log('sep10 ok');

const info = await json(await fetch(`${base}/transfer24/info`));
log('info', info.deposit[code]);

// Deposit
const dep = await json(
  await fetch(`${base}/transfer24/transactions/deposit/interactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asset_code: code }),
  }),
);
log('deposit started', { id: dep.id, url: dep.url.slice(0, 60) + '...' });
await transitions.submitDepositAmount(dep.id, depositAmount);
const ticket = await poll(token, dep.id, (s) => s === 'pending_user_transfer_start');
log('deposit ticket', { external_extra: ticket.external_extra, amount_out: ticket.amount_out });
await transitions.markDepositReceived(dep.id, 'user');
const depDone = await poll(token, dep.id, (s) => transitions.isTerminal(s));
log('deposit final', { status: depDone.status, stellar_transaction_id: depDone.stellar_transaction_id });
if (depDone.status !== 'completed') throw new Error('Deposit did not complete');

account = await horizon.loadAccount(user.publicKey());
const bal = account.balances.find((b: any) => b.asset_code === code && b.asset_issuer === issuer);
log('on-chain balance after deposit', bal?.balance);

// Withdrawal
const wd = await json(
  await fetch(`${base}/transfer24/transactions/withdraw/interactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asset_code: code, amount: withdrawAmount }),
  }),
);
const before = (await poll(token, wd.id, () => true)) as Record<string, any>;
log('withdraw incomplete hides anchor account', { withdraw_anchor_account: before.withdraw_anchor_account ?? null });
await transitions.submitWithdrawDetails(wd.id, {
  amount: withdrawAmount,
  destination: { holder: 'Juana Perez', bankAccount: '0'.repeat({ ARS: 22, PEN: 20, COP: 16 }[code]) },
});
const instr = await poll(token, wd.id, (s) => s === 'pending_user_transfer_start');
log('withdraw instructions', { to: instr.withdraw_anchor_account, memo: instr.withdraw_memo, amount_in: instr.amount_in });

account = await horizon.loadAccount(user.publicKey());
const pay = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ destination: instr.withdraw_anchor_account, asset, amount: instr.amount_in }))
  .addMemo(Memo.hash(Buffer.from(instr.withdraw_memo, 'base64')))
  .setTimeout(60)
  .build();
pay.sign(user);
const sent = await horizon.submitTransaction(pay);
log('withdraw payment sent', { hash: sent.hash });
const wdDone = await poll(token, wd.id, (s) => transitions.isTerminal(s));
log('withdraw final', { status: wdDone.status, from: wdDone.from, stellar_transaction_id: wdDone.stellar_transaction_id });
if (wdDone.status !== 'completed') throw new Error('Withdrawal did not complete');

const history = await json(
  await fetch(`${base}/transfer24/transactions?asset_code=${code}`, { headers: { Authorization: `Bearer ${token}` } }),
);
log(
  'history',
  history.transactions.map((t: any) => `${t.kind}:${t.status}`),
);
log(`OK: ${code} deposit and withdrawal completed end to end`);
await db().$disconnect();
