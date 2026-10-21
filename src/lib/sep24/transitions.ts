import { createHash, randomBytes } from 'node:crypto';
import { AccountRole, type Prisma, type Transaction, type TransactionKind } from '@prisma/client';
import { Memo } from '@stellar/stellar-sdk';
import { activeKeypair, requireActiveAccount } from '../accounts';
import { fromStroops, isValidAmount, toStroops } from '../amount';
import { FIAT_META, fiatAsset, isFiatCode, type FiatCode } from '../assets';
import { db } from '../db';
import { checkLimits, type Operation, quoteFee } from '../fees';
import { MAGIC_AMOUNTS, magicOutcome } from '../magic';
import { sendPayment } from '../payments';
import { getSettings, type Settings } from '../settings';
import { formatAmount, type Sep24Refunds } from './serialize';

// Contract shared by the SEP-24 API (F5), the interactive pages (F6) and the admin (F7).
// Every status change goes through these functions so it is validated and logged in TransactionEvent.
//
// Deposit:    incomplete -> pending_user_transfer_start -> pending_anchor -> completed
// Withdrawal: incomplete -> pending_user_transfer_start -> pending_anchor -> completed
// Any non-terminal status may end in error / refunded / expired / too_small / too_large / no_market.
// withdraw_anchor_account and withdraw_memo stay null until submitWithdrawDetails: clients pay as soon as
// they see that field.

export type Actor = 'user' | 'system' | 'watcher' | `admin:${string}`;

export const TERMINAL_STATUSES = ['completed', 'error', 'refunded', 'expired', 'too_small', 'too_large', 'no_market'] as const;

export const SEP24_STATUSES = [
  'incomplete',
  'pending_user_transfer_start',
  'pending_user_transfer_complete',
  'pending_external',
  'pending_anchor',
  'pending_stellar',
  'pending_trust',
  'pending_user',
  ...TERMINAL_STATUSES,
] as const;

export type FailureStatus = Exclude<(typeof TERMINAL_STATUSES)[number], 'completed'>;

const FAILURE_STATUSES: readonly string[] = TERMINAL_STATUSES.filter((s) => s !== 'completed');

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export interface CreateInput {
  kind: TransactionKind;
  assetCode: FiatCode;
  account: string;
  amount?: string;
  memo?: string;
  memoType?: string;
  lang?: string;
  clientDomain?: string;
}

export interface WithdrawDestination {
  holder: string;
  bankAccount: string;
  bankName?: string;
}

export interface IncomingPayment {
  txHash: string;
  from: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  memo: string | null;
  memoType: string;
}

export type TransitionErrorCode =
  | 'not_found'
  | 'invalid_state'
  | 'invalid_amount'
  | 'invalid_memo'
  | 'invalid_destination'
  | 'too_small'
  | 'too_large'
  | 'daily_limit'
  | 'conflict';

/** Rejected user input or an illegal transition. The transaction itself is left untouched. */
export class TransitionError extends Error {
  constructor(
    readonly code: TransitionErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

type Client = Prisma.TransactionClient;

const BANK_HOLDER = 'POLLAR SANDBOX SA';

/** Conditional on the current status, so two concurrent callers cannot both apply the same step. */
async function move(
  client: Client,
  tx: Transaction,
  to: string,
  data: Prisma.TransactionUpdateManyMutationInput,
  actor: Actor,
  note?: string,
): Promise<Transaction> {
  const res = await client.transaction.updateMany({ where: { id: tx.id, status: tx.status }, data: { ...data, status: to } });
  if (res.count !== 1) throw new TransitionError('conflict', `Transaction ${tx.id} changed while it was being updated`);
  await client.transactionEvent.create({
    data: { transaction_id: tx.id, from_status: tx.status, to_status: to, actor, note: note ?? null },
  });
  return client.transaction.findUniqueOrThrow({ where: { id: tx.id } });
}

async function load(client: Client, id: string): Promise<Transaction> {
  const tx = await client.transaction.findUnique({ where: { id } });
  if (!tx) throw new TransitionError('not_found', `Transaction ${id} not found`);
  return tx;
}

function expectState(tx: Transaction, kind: TransactionKind, status: string): FiatCode {
  if (tx.kind !== kind) throw new TransitionError('invalid_state', `Transaction ${tx.id} is not a ${kind}`);
  if (tx.status !== status)
    throw new TransitionError('invalid_state', `Transaction ${tx.id} is ${tx.status}, expected ${status}`);
  if (!isFiatCode(tx.asset_code)) throw new TransitionError('invalid_state', `Unsupported asset ${tx.asset_code}`);
  return tx.asset_code;
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

function decimalString(value: { toFixed(digits: number): string } | null): string {
  return value ? value.toFixed(7) : '0';
}

/** Builds the Stellar memo for a deposit payment. Throws TransitionError on a malformed memo. */
export function toStellarMemo(memo: string | null | undefined, memoType: string | null | undefined): Memo | undefined {
  if (!memo) return undefined;
  try {
    switch (memoType ?? 'text') {
      case 'text':
        return Memo.text(memo);
      case 'id':
        return Memo.id(memo);
      case 'hash': {
        const bytes = /^[0-9a-f]{64}$/i.test(memo) ? Buffer.from(memo, 'hex') : Buffer.from(memo, 'base64');
        return Memo.hash(bytes);
      }
      default:
        throw new Error(`memo_type must be text, id or hash`);
    }
  } catch (err) {
    throw new TransitionError('invalid_memo', err instanceof Error ? err.message : 'Invalid memo');
  }
}

/** Fiat amounts carry at most 2 decimals. */
function validateAmount(amount: string): string {
  const value = amount.trim();
  if (!isValidAmount(value) || !/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new TransitionError('invalid_amount', 'Ingrese un monto valido, con hasta 2 decimales');
  }
  return value;
}

function enforceLimits(settings: Settings, code: FiatCode, op: Operation, amount: string): void {
  const check = checkLimits(settings, code, op, amount);
  if (!check.ok) {
    const min = fromStroops(toStroops(check.min), 2);
    const max = fromStroops(toStroops(check.max), 2);
    throw new TransitionError(check.reason, `Ingrese un monto entre ${min} y ${max}`, { min, max });
  }
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** F8: caps what one account can move per asset and UTC day, deposits and withdrawals combined. */
async function enforceDailyCap(client: Client, tx: Transaction, code: FiatCode, amount: string, settings: Settings) {
  const cap = settings.account_limits[code].daily;
  const agg = await client.transaction.aggregate({
    _sum: { amount_in: true },
    where: {
      account: tx.account,
      asset_code: code,
      id: { not: tx.id },
      started_at: { gte: startOfUtcDay() },
      status: { notIn: [...FAILURE_STATUSES] },
      amount_in: { not: null },
    },
  });
  const used = toStroops(decimalString(agg._sum.amount_in));
  if (used + toStroops(amount) > toStroops(cap)) {
    const capText = fromStroops(toStroops(cap), 2);
    const usedText = fromStroops(used, 2);
    throw new TransitionError(
      'daily_limit',
      `Superaste el tope diario de ${code} ${capText} para esta cuenta (usado hoy: ${usedText})`,
      { cap: capText, used: usedText },
    );
  }
}

function outcomeMessage(status: string): string {
  const found = Object.values(MAGIC_AMOUNTS).find((o) => o.status === status);
  return found?.message ?? `Transaction ended as ${status}.`;
}

function refundsFor(tx: Transaction, paymentId: string, idType: 'stellar' | 'external'): Sep24Refunds {
  const amount = formatAmount(tx.amount_in) ?? '0.00';
  return { amount_refunded: amount, amount_fee: '0.00', payments: [{ id: paymentId, id_type: idType, amount, fee: '0.00' }] };
}

/** Data that ends a transaction in its magic-amount outcome. */
function forcedOutcomeData(tx: Transaction, paymentId: string, idType: 'stellar' | 'external') {
  const status = tx.forced_outcome!;
  const data: Prisma.TransactionUpdateManyMutationInput = { message: outcomeMessage(status), forced_outcome: null };
  if (status === 'refunded') {
    data.refunded = true;
    data.refunds = refundsFor(tx, paymentId, idType) as unknown as Prisma.InputJsonValue;
  }
  return { status, data };
}

/** Deterministic digits from a seed, so a transaction always shows the same fake bank numbers. */
function digitsFrom(seed: string, length: number): string {
  let out = '';
  for (let counter = 0; out.length < length; counter++) {
    for (const byte of createHash('sha256').update(`${seed}:${counter}`).digest()) {
      // Skipping 250..255 keeps the digit distribution uniform.
      if (byte < 250) out += String(byte % 10);
      if (out.length === length) break;
    }
  }
  return out;
}

export interface DepositTicket {
  bankField: string;
  bankAccount: string;
  alias: string;
  holder: string;
  bankName: string;
  ref: string;
  externalExtra: string;
  externalExtraText: string;
}

export function depositTicket(id: string, code: FiatCode, amountIn: string): DepositTicket {
  const meta = FIAT_META[code];
  const bankAccount = digitsFrom(`account:${id}`, code === 'ARS' ? 22 : 20);
  const ref = digitsFrom(`ref:${id}`, 8);
  const amount = `${meta.symbol} ${fromStroops(toStroops(amountIn), 2)}`;
  const externalExtraText = [
    `Transferi exactamente ${amount} desde una cuenta bancaria a tu nombre.`,
    `Titular: ${BANK_HOLDER}. ${meta.bankField}: ${bankAccount}. Alias: ${meta.alias}. Banco: ${meta.bankName}.`,
    `Indica el numero ${ref} en el campo REF (concepto) de la transferencia.`,
    'Cuenta de prueba (sandbox): no transfieras dinero real, la transferencia se confirma desde el ticket.',
  ].join(' ');
  return {
    bankField: meta.bankField,
    bankAccount,
    alias: meta.alias,
    holder: BANK_HOLDER,
    bankName: meta.bankName,
    ref,
    externalExtra: `${bankAccount}|${meta.alias}|${BANK_HOLDER}|${meta.bankName}|${ref}`,
    externalExtraText,
  };
}

function bankTransferId(prefix: string, id: string): string {
  return `${prefix}-${digitsFrom(`bank:${id}`, 12)}`;
}

export async function createTransaction(input: CreateInput): Promise<Transaction> {
  const amount = input.amount ? validateAmount(input.amount) : undefined;
  if (input.memo) toStellarMemo(input.memo, input.memoType);
  return db().$transaction(async (client) => {
    const tx = await client.transaction.create({
      data: {
        kind: input.kind,
        status: 'incomplete',
        asset_code: input.assetCode,
        account: input.account,
        memo: input.memo ?? null,
        memo_type: input.memo ? (input.memoType ?? 'text') : null,
        lang: input.lang ?? null,
        client_domain: input.clientDomain ?? null,
        amount_expected: amount ?? null,
      },
    });
    await client.transactionEvent.create({
      data: { transaction_id: tx.id, from_status: null, to_status: 'incomplete', actor: 'user' },
    });
    return tx;
  });
}

/** Deposit form submitted: stores amounts, applies magic amounts, shows the bank ticket. */
export async function submitDepositAmount(id: string, amount: string): Promise<Transaction> {
  const value = validateAmount(amount);
  const settings = await getSettings();
  return db().$transaction(async (client) => {
    const tx = await load(client, id);
    const code = expectState(tx, 'deposit', 'incomplete');
    enforceLimits(settings, code, 'deposit', value);
    await enforceDailyCap(client, tx, code, value, settings);
    const quote = quoteFee(settings, code, 'deposit', value);
    const ticket = depositTicket(tx.id, code, quote.amount_in);
    return move(
      client,
      tx,
      'pending_user_transfer_start',
      {
        amount_in: quote.amount_in,
        amount_fee: quote.amount_fee,
        amount_out: quote.amount_out,
        forced_outcome: magicOutcome(value)?.status ?? null,
        external_extra: ticket.externalExtra,
        external_extra_text: ticket.externalExtraText,
        to: tx.account,
        user_action_required_by: minutesFromNow(settings.expire_minutes),
      },
      'user',
    );
  });
}

/** "Transfer received" (ticket button, auto-receive job or admin): pays the asset on-chain and completes. */
export async function markDepositReceived(id: string, actor: Actor): Promise<Transaction> {
  const pending = await db().$transaction(async (client) => {
    const tx = await load(client, id);
    expectState(tx, 'deposit', 'pending_user_transfer_start');
    const externalId = bankTransferId('DEP', tx.id);
    if (tx.forced_outcome) {
      const { status, data } = forcedOutcomeData(tx, externalId, 'external');
      return move(client, tx, status, { ...data, external_transaction_id: externalId }, actor, 'magic amount');
    }
    return move(
      client,
      tx,
      'pending_anchor',
      { external_transaction_id: externalId, user_action_required_by: null },
      actor,
      'bank transfer received',
    );
  });
  if (pending.status !== 'pending_anchor') return pending;

  // The payment runs outside the DB transaction: the status guard above already makes this caller the
  // only one that can pay this deposit.
  const code = pending.asset_code as FiatCode;
  const memo = toStellarMemo(pending.memo, pending.memo_type);
  let hash: string;
  try {
    const asset = await fiatAsset(code);
    const amount = pending.amount_out ? pending.amount_out.toFixed(7) : '0';
    if (toStroops(amount) <= 0n) throw new PaymentFailure('the amount to deliver after fees is zero');
    try {
      hash = await sendPayment({
        from: await activeKeypair(AccountRole.DISTRIBUTION),
        to: pending.account,
        asset,
        amount,
        memo,
      });
    } catch (err) {
      throw new PaymentFailure(describePaymentError(err, `${code}:${asset.getIssuer()}`));
    }
  } catch (err) {
    const message = err instanceof PaymentFailure ? err.message : `Deposit payment failed: ${errorText(err)}`;
    return db().$transaction(async (client) => move(client, await load(client, id), 'error', { message }, 'system'));
  }

  return db().$transaction(async (client) =>
    move(
      client,
      await load(client, id),
      'completed',
      {
        stellar_transaction_id: hash,
        completed_at: new Date(),
        deposit_memo: memo ? pending.memo : null,
        deposit_memo_type: memo ? pending.memo_type : null,
      },
      'system',
      'paid on-chain',
    ),
  );
}

class PaymentFailure extends Error {}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Turns a Horizon submit error into a message an integrator can act on. */
export function describePaymentError(err: unknown, assetLabel: string): string {
  const codes = (
    err as { response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } } }
  )?.response?.data?.extras?.result_codes;
  const ops = codes?.operations ?? [];
  if (ops.includes('op_no_trust')) return `the account has no trustline to ${assetLabel}`;
  if (ops.includes('op_not_authorized')) return `the account is not authorized to hold ${assetLabel}`;
  if (ops.includes('op_line_full')) return `the account trustline to ${assetLabel} has no room for this amount`;
  if (ops.includes('op_no_destination')) return 'the account does not exist on testnet';
  if (ops.includes('op_underfunded')) return `the anchor distribution account is out of ${assetLabel}`;
  if (codes) return `payment rejected by the network: ${[codes.transaction, ...ops].filter(Boolean).join(', ')}`;
  return `payment could not be submitted: ${errorText(err)}`;
}

function validateDestination(code: FiatCode, d: WithdrawDestination): WithdrawDestination {
  const holder = d.holder?.trim();
  const bankAccount = d.bankAccount?.replace(/[\s-]/g, '');
  const field = FIAT_META[code].bankField;
  const length = code === 'ARS' ? 22 : 20;
  if (!holder) throw new TransitionError('invalid_destination', 'Ingrese el titular de la cuenta');
  if (!bankAccount || !new RegExp(`^\\d{${length}}$`).test(bankAccount)) {
    throw new TransitionError('invalid_destination', `El ${field} debe tener ${length} digitos`);
  }
  return { holder, bankAccount, bankName: d.bankName?.trim() || undefined };
}

/** Withdraw form submitted: assigns withdraw_anchor_account + a hash memo. */
export async function submitWithdrawDetails(
  id: string,
  input: { amount: string; destination: WithdrawDestination },
): Promise<Transaction> {
  const value = validateAmount(input.amount);
  const settings = await getSettings();
  const withdrawAccount = await requireActiveAccount(AccountRole.WITHDRAW);
  return db().$transaction(async (client) => {
    const tx = await load(client, id);
    const code = expectState(tx, 'withdrawal', 'incomplete');
    const destination = validateDestination(code, input.destination);
    enforceLimits(settings, code, 'withdraw', value);
    await enforceDailyCap(client, tx, code, value, settings);
    const quote = quoteFee(settings, code, 'withdraw', value);
    return move(
      client,
      tx,
      'pending_user_transfer_start',
      {
        amount_in: quote.amount_in,
        amount_fee: quote.amount_fee,
        amount_out: quote.amount_out,
        forced_outcome: magicOutcome(value)?.status ?? null,
        withdraw_anchor_account: withdrawAccount.public_key,
        withdraw_memo: randomBytes(32).toString('base64'),
        withdraw_memo_type: 'hash',
        destination: { ...destination } as Prisma.InputJsonValue,
        to: destination.bankAccount,
        user_action_required_by: minutesFromNow(settings.expire_minutes),
      },
      'user',
    );
  });
}

/** Horizon returns hash memos in base64; anything else that decodes to 32 bytes is normalized the same way. */
function normalizeHashMemo(memo: string): string | null {
  const bytes = /^[0-9a-f]{64}$/i.test(memo) ? Buffer.from(memo, 'hex') : Buffer.from(memo, 'base64');
  return bytes.length === 32 ? bytes.toString('base64') : null;
}

/** Called by the Horizon watcher for every payment to the withdraw account. Returns null if no tx matches. */
export async function handleWithdrawPayment(payment: IncomingPayment): Promise<Transaction | null> {
  const seen = await db().transaction.findFirst({ where: { stellar_transaction_id: payment.txHash } });
  if (seen) return seen;
  if (payment.memoType !== 'hash' || !payment.memo) return null;
  const memo = normalizeHashMemo(payment.memo);
  if (!memo) return null;

  const candidate = await db().transaction.findUnique({ where: { withdraw_memo: memo } });
  if (!candidate || candidate.kind !== 'withdrawal' || !isFiatCode(candidate.asset_code)) return null;
  if (candidate.status !== 'pending_user_transfer_start') return candidate;
  const expected = await fiatAsset(candidate.asset_code);

  return db().$transaction(async (client) => {
    const tx = await load(client, candidate.id);
    if (tx.status !== 'pending_user_transfer_start') return tx;
    const received = { from: payment.from, stellar_transaction_id: payment.txHash };

    if (payment.assetCode !== expected.getCode() || payment.assetIssuer !== expected.getIssuer()) {
      const message = `Received ${payment.assetCode}:${payment.assetIssuer}, expected ${expected.getCode()}:${expected.getIssuer()}.`;
      return move(client, tx, 'error', { ...received, message }, 'watcher');
    }
    const expectedAmount = decimalString(tx.amount_in);
    if (toStroops(payment.amount) < toStroops(expectedAmount)) {
      const message = `Received ${fromStroops(toStroops(payment.amount), 2)} ${tx.asset_code}, expected at least ${fromStroops(toStroops(expectedAmount), 2)} ${tx.asset_code}.`;
      return move(client, tx, 'error', { ...received, message }, 'watcher');
    }

    const anchored = await move(
      client,
      tx,
      'pending_anchor',
      { ...received, user_action_required_by: null },
      'watcher',
      'payment received',
    );
    if (anchored.forced_outcome) {
      const { status, data } = forcedOutcomeData(anchored, payment.txHash, 'stellar');
      return move(client, anchored, status, data, 'system', 'magic amount');
    }
    return move(
      client,
      anchored,
      'completed',
      { completed_at: new Date(), external_transaction_id: bankTransferId('WDR', anchored.id) },
      'system',
      'simulated bank payout',
    );
  });
}

export async function failTransaction(id: string, status: FailureStatus, message: string, actor: Actor): Promise<Transaction> {
  return db().$transaction(async (client) => {
    const tx = await load(client, id);
    if (isTerminal(tx.status)) throw new TransitionError('invalid_state', `Transaction ${id} is already ${tx.status}`);
    return move(client, tx, status, { message, user_action_required_by: null }, actor, message);
  });
}

/** Admin override. Records the note in TransactionEvent. Moving to completed does not pay anything. */
export async function forceStatus(id: string, status: string, actor: Actor, note?: string): Promise<Transaction> {
  if (!(SEP24_STATUSES as readonly string[]).includes(status)) {
    throw new TransitionError('invalid_state', `Unknown SEP-24 status ${status}`);
  }
  return db().$transaction(async (client) => {
    const tx = await load(client, id);
    const data: Prisma.TransactionUpdateManyMutationInput = {};
    if (status === 'completed' && !tx.completed_at) data.completed_at = new Date();
    if (FAILURE_STATUSES.includes(status) && note) data.message = note;
    return move(client, tx, status, data, actor, note);
  });
}

/** Expires transactions that waited longer than settings.expire_minutes. Returns how many. */
export async function expireStale(): Promise<number> {
  const settings = await getSettings();
  const now = new Date();
  const cutoff = new Date(now.getTime() - settings.expire_minutes * 60_000);
  const stale = await db().transaction.findMany({
    where: {
      OR: [
        { status: 'incomplete', started_at: { lt: cutoff } },
        { status: 'pending_user_transfer_start', user_action_required_by: { lt: now } },
        { status: 'pending_user_transfer_start', user_action_required_by: null, updated_at: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });
  const message = `Expired: no user action within ${settings.expire_minutes} minutes.`;
  let count = 0;
  for (const { id } of stale) {
    try {
      await db().$transaction(async (client) => {
        const tx = await load(client, id);
        if (tx.status !== 'incomplete' && tx.status !== 'pending_user_transfer_start') return;
        await move(client, tx, 'expired', { message, user_action_required_by: null }, 'system');
        count++;
      });
    } catch (err) {
      if (!(err instanceof TransitionError)) throw err;
    }
  }
  return count;
}

/** Deposits whose ticket has been waiting longer than `seconds`, for the auto-receive job. */
export async function depositsAwaitingTransfer(seconds: number): Promise<string[]> {
  const rows = await db().transaction.findMany({
    where: {
      kind: 'deposit',
      status: 'pending_user_transfer_start',
      updated_at: { lt: new Date(Date.now() - seconds * 1000) },
    },
    select: { id: true },
    orderBy: { updated_at: 'asc' },
    take: 50,
  });
  return rows.map((r) => r.id);
}
