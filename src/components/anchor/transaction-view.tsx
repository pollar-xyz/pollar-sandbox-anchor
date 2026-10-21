import type { Transaction } from '@prisma/client';
import type { ReactNode } from 'react';
import { DepositTicket } from './deposit-ticket';
import { StatusTicket } from './status-ticket';
import { WithdrawSend } from './withdraw-send';

/** Read-only view of a submitted transaction, shared by the interactive flow and more_info. */
export function TransactionView({ tx, sandboxControls }: { tx: Transaction; sandboxControls?: ReactNode }) {
  if (tx.status === 'pending_user_transfer_start') {
    return tx.kind === 'deposit' ? <DepositTicket tx={tx} sandboxControls={sandboxControls} /> : <WithdrawSend tx={tx} />;
  }
  return <StatusTicket tx={tx} />;
}
