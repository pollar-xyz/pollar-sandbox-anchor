import type { Transaction } from '@prisma/client';
import { fromStroops, toStroops } from '../amount';
import { publicUrl } from '../stellar';

export const STATUS_ETA_SECONDS = 3600;

export interface Sep24Refunds {
  amount_refunded: string;
  amount_fee: string;
  payments: { id: string; id_type: 'stellar' | 'external'; amount: string; fee: string }[];
}

export interface Sep24Transaction {
  id: string;
  kind: 'deposit' | 'withdrawal';
  status: string;
  status_eta: number;
  more_info_url: string;
  amount_in: string | null;
  amount_out: string | null;
  amount_fee: string | null;
  started_at: string;
  completed_at: string | null;
  user_action_required_by?: string;
  stellar_transaction_id: string | null;
  external_transaction_id: string | null;
  message: string | null;
  refunded: boolean;
  refunds?: Sep24Refunds;
  from: string | null;
  to: string | null;
  deposit_memo?: string | null;
  deposit_memo_type?: string | null;
  external_extra?: string | null;
  external_extra_text?: string | null;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
}

/** Prisma Decimal, or anything that prints itself with a fixed number of decimals. */
type DecimalLike = { toFixed(digits: number): string };

/** Fiat amounts go out with 2 decimals, as the real anchor sends them. */
export function formatAmount(value: DecimalLike | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return fromStroops(toStroops(value.toFixed(7)), 2);
}

export function serializeTransaction(tx: Transaction): Sep24Transaction {
  const out: Sep24Transaction = {
    id: tx.id,
    kind: tx.kind,
    status: tx.status,
    status_eta: STATUS_ETA_SECONDS,
    more_info_url: publicUrl(`/transfer24/transaction/more_info/${tx.id}`),
    amount_in: formatAmount(tx.amount_in),
    amount_out: formatAmount(tx.amount_out),
    amount_fee: formatAmount(tx.amount_fee),
    started_at: tx.started_at.toISOString(),
    completed_at: tx.completed_at ? tx.completed_at.toISOString() : null,
    stellar_transaction_id: tx.stellar_transaction_id,
    external_transaction_id: tx.external_transaction_id,
    message: tx.message,
    refunded: tx.refunded,
    // The Stellar side is the user's account from the start; the bank side stays unknown until the transfer.
    from: tx.from ?? (tx.kind === 'withdrawal' ? tx.account : null),
    to: tx.to ?? (tx.kind === 'deposit' ? tx.account : null),
  };
  if (tx.user_action_required_by) out.user_action_required_by = tx.user_action_required_by.toISOString();
  if (tx.refunds) out.refunds = tx.refunds as unknown as Sep24Refunds;

  if (tx.kind === 'deposit') {
    out.deposit_memo = tx.deposit_memo;
    out.deposit_memo_type = tx.deposit_memo_type;
    out.external_extra = tx.external_extra;
    out.external_extra_text = tx.external_extra_text;
  } else {
    if (tx.withdraw_anchor_account) out.withdraw_anchor_account = tx.withdraw_anchor_account;
    if (tx.withdraw_memo) out.withdraw_memo = tx.withdraw_memo;
    if (tx.withdraw_memo_type) out.withdraw_memo_type = tx.withdraw_memo_type;
  }
  // SEP-24 schemas reject null for optional fields: an unknown value is omitted, not sent as null.
  for (const key of Object.keys(out) as (keyof Sep24Transaction)[]) {
    if (out[key] === null) delete out[key];
  }
  return out;
}
