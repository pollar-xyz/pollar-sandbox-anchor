import { AccountRole } from '@prisma/client';
import { getActiveAccount } from '../accounts';
import { db } from '../db';
import { handleWithdrawPayment, type IncomingPayment } from '../sep24/transitions';
import { horizon } from '../stellar';
import { type HeldLock, tryAdvisoryLock } from './lock';

const LOCK_KEY = 1_340_140;
const LOCK_RETRY_MS = 60_000;
const ACCOUNT_CHECK_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
const PAYMENT_TYPES = new Set(['payment', 'path_payment_strict_receive', 'path_payment_strict_send']);

/** Subset of a Horizon payment operation record (joined with its transaction) that the watcher reads. */
export interface PaymentRecord {
  paging_token: string;
  type: string;
  transaction_hash: string;
  transaction_successful?: boolean;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  transaction_attr?: { memo?: string; memo_type?: string };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

export function cursorKey(account: string): string {
  return `withdraw-payments:${account}`;
}

/** Maps a Horizon record to the transitions input, or null when it is not an incoming payment to `account`. */
export async function toIncomingPayment(record: PaymentRecord, account: string): Promise<IncomingPayment | null> {
  if (!PAYMENT_TYPES.has(record.type) || record.to !== account || record.transaction_successful === false) return null;
  let memoInfo = record.transaction_attr;
  if (!memoInfo) {
    const tx = await horizon().transactions().transaction(record.transaction_hash).call();
    memoInfo = { memo: tx.memo, memo_type: tx.memo_type };
  }
  const native = record.asset_type === 'native';
  return {
    txHash: record.transaction_hash,
    from: record.from ?? '',
    assetCode: native ? 'XLM' : (record.asset_code ?? ''),
    assetIssuer: native ? '' : (record.asset_issuer ?? ''),
    amount: record.amount ?? '0',
    memo: memoInfo.memo ?? null,
    memoType: memoInfo.memo_type ?? 'none',
  };
}

export async function processRecord(record: PaymentRecord, account: string): Promise<void> {
  const payment = await toIncomingPayment(record, account);
  if (payment) {
    const tx = await handleWithdrawPayment(payment);
    if (tx) console.info(`[watcher] payment ${payment.txHash} -> transaction ${tx.id} (${tx.status})`);
    else console.warn(`[watcher] payment ${payment.txHash} matches no withdrawal`);
  }
  await db().streamCursor.upsert({
    where: { key: cursorKey(account) },
    create: { key: cursorKey(account), cursor: record.paging_token },
    update: { cursor: record.paging_token },
  });
}

type StreamEnd = 'error' | 'rotated' | 'lost';

async function streamOnce(account: string, lost: Promise<void>): Promise<{ end: StreamEnd; progressed: boolean }> {
  const saved = await db().streamCursor.findUnique({ where: { key: cursorKey(account) } });
  let progressed = false;
  let queue = Promise.resolve();
  let finish: (end: StreamEnd) => void = () => {};
  const ended = new Promise<StreamEnd>((resolve) => (finish = resolve));

  const close = horizon()
    .payments()
    .forAccount(account)
    .join('transactions')
    .cursor(saved?.cursor ?? 'now')
    .stream({
      onmessage: (record) => {
        // Records are processed one at a time so the cursor only moves past handled payments.
        queue = queue
          .then(() => processRecord(record as unknown as PaymentRecord, account))
          .then(() => {
            progressed = true;
          })
          .catch((err) => {
            console.error('[watcher] failed to process a payment, restarting the stream', err);
            finish('error');
          });
      },
      onerror: (err) => {
        console.warn('[watcher] stream error', err instanceof Error ? err.message : err);
        finish('error');
      },
    });

  const rotation = setInterval(() => {
    getActiveAccount(AccountRole.WITHDRAW)
      .then((current) => {
        if (current?.public_key !== account) finish('rotated');
      })
      .catch(() => {});
  }, ACCOUNT_CHECK_MS);
  void lost.then(() => finish('lost'));

  const end = await ended;
  clearInterval(rotation);
  close();
  await queue;
  return { end, progressed };
}

async function runWhileHeld(lock: HeldLock): Promise<void> {
  let lockLost = false;
  void lock.lost.then(() => (lockLost = true));
  let backoff = 1_000;
  while (!lockLost) {
    const account = await getActiveAccount(AccountRole.WITHDRAW).catch(() => null);
    if (!account) {
      await Promise.race([sleep(30_000), lock.lost]);
      continue;
    }
    console.info(`[watcher] streaming payments to ${account.public_key}`);
    const { end, progressed } = await streamOnce(account.public_key, lock.lost).catch((err) => {
      console.error('[watcher] could not open the stream', err);
      return { end: 'error' as const, progressed: false };
    });
    if (end === 'error') {
      backoff = progressed ? 1_000 : Math.min(backoff * 2, MAX_BACKOFF_MS);
      await Promise.race([sleep(backoff), lock.lost]);
    } else {
      backoff = 1_000;
    }
  }
}

/**
 * Streams Horizon payments to the active WITHDRAW account and feeds them to handleWithdrawPayment.
 * Only the process holding the Postgres advisory lock streams, so scaling out never double-processes.
 */
export async function runWithdrawWatcher(): Promise<never> {
  for (;;) {
    let lock: HeldLock | null = null;
    try {
      lock = await tryAdvisoryLock(LOCK_KEY);
    } catch (err) {
      console.error('[watcher] could not take the advisory lock', err);
    }
    if (!lock) {
      await sleep(LOCK_RETRY_MS);
      continue;
    }
    console.info('[watcher] advisory lock acquired');
    await runWhileHeld(lock);
    console.warn('[watcher] advisory lock lost');
    await lock.release();
    await sleep(5_000);
  }
}
