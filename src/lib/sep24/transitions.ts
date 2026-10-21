import type { Transaction, TransactionKind } from '@prisma/client';
import type { FiatCode } from '../assets';

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

function notImplemented(): never {
  throw new Error('Not implemented yet (DEV-140)');
}

export async function createTransaction(_input: CreateInput): Promise<Transaction> {
  notImplemented();
}

/** Deposit form submitted: stores amounts, applies magic amounts, shows the bank ticket. */
export async function submitDepositAmount(_id: string, _amount: string): Promise<Transaction> {
  notImplemented();
}

/** "Transfer received" (ticket button, auto-receive job or admin): pays the asset on-chain and completes. */
export async function markDepositReceived(_id: string, _actor: Actor): Promise<Transaction> {
  notImplemented();
}

/** Withdraw form submitted: assigns withdraw_anchor_account + a hash memo. */
export async function submitWithdrawDetails(
  _id: string,
  _input: { amount: string; destination: WithdrawDestination },
): Promise<Transaction> {
  notImplemented();
}

/** Called by the Horizon watcher for every payment to the withdraw account. Returns null if no tx matches. */
export async function handleWithdrawPayment(_payment: IncomingPayment): Promise<Transaction | null> {
  notImplemented();
}

export async function failTransaction(
  _id: string,
  _status: Exclude<(typeof TERMINAL_STATUSES)[number], 'completed'>,
  _message: string,
  _actor: Actor,
): Promise<Transaction> {
  notImplemented();
}

/** Admin override. Records the note in TransactionEvent. */
export async function forceStatus(_id: string, _status: string, _actor: Actor, _note?: string): Promise<Transaction> {
  notImplemented();
}

/** Expires transactions that waited longer than settings.expire_minutes. Returns how many. */
export async function expireStale(): Promise<number> {
  notImplemented();
}
