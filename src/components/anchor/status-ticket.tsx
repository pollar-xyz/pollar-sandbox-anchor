import type { Transaction } from '@prisma/client';
import {
  currencySymbol,
  formatAmount,
  formatDateTime,
  isTerminal,
  statusInfo,
  stellarExpertTxUrl,
} from '@/app/interactive/_lib/format';
import { AutoRefresh } from './auto-refresh';
import { InfoBox } from './shell';
import { StatusBadge } from './status-badge';
import { CloseHint, TicketFooter, TicketFrame, TicketRow } from './ticket-parts';

const HEADLINES: Record<'pending' | 'success' | 'failure', { deposit: string; withdrawal: string }> = {
  pending: { deposit: 'Estamos procesando tu depósito', withdrawal: 'Estamos procesando tu retiro' },
  success: { deposit: 'Depósito acreditado en tu wallet', withdrawal: 'Retiro enviado a tu cuenta bancaria' },
  failure: { deposit: 'El depósito no se pudo completar', withdrawal: 'El retiro no se pudo completar' },
};

export function StatusTicket({ tx }: { tx: Transaction }) {
  const status = statusInfo(tx.status, tx.kind);
  const symbol = currencySymbol(tx.asset_code);
  const amountIn = formatAmount(tx.amount_in) ?? formatAmount(tx.amount_expected);
  const amountFee = formatAmount(tx.amount_fee);
  const amountOut = formatAmount(tx.amount_out);
  const money = (v: string | null) => (v ? `${symbol} ${v}` : '-');

  return (
    <>
      <AutoRefresh active={!isTerminal(tx.status)} />
      <TicketFrame
        title={tx.kind === 'deposit' ? 'Ticket de Depósito' : 'Ticket de Retiro'}
        badge={<StatusBadge label={status.label} tone={status.tone} />}
      >
        <div className="text-center">
          <p className="text-brand">{HEADLINES[status.tone][tx.kind]}</p>
          <p className="text-brand mt-2 text-4xl font-semibold sm:text-5xl">{money(amountIn)}</p>
          <p className="text-muted mt-1 text-sm">{tx.asset_code}</p>
        </div>

        {tx.message ? (
          <div className="mt-5">
            <InfoBox tone={status.tone === 'failure' ? 'danger' : status.tone === 'success' ? 'success' : 'info'}>
              {tx.message}
            </InfoBox>
          </div>
        ) : null}

        <dl className="mt-4 divide-y divide-gray-100">
          <TicketRow label={tx.kind === 'deposit' ? 'Monto transferido' : 'Monto enviado'}>{money(amountIn)}</TicketRow>
          <TicketRow label="Cargos de operación">{money(amountFee)}</TicketRow>
          <TicketRow label="Monto final a recibir">{amountOut ? `${tx.asset_code} ${amountOut}` : '-'}</TicketRow>
          {tx.kind === 'withdrawal' && tx.to ? (
            <TicketRow label="Cuenta destino" mono>
              {tx.to}
            </TicketRow>
          ) : null}
          {tx.stellar_transaction_id ? (
            <TicketRow label="Transacción Stellar" mono>
              <a
                href={stellarExpertTxUrl(tx.stellar_transaction_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline underline-offset-2"
              >
                {tx.stellar_transaction_id}
              </a>
            </TicketRow>
          ) : null}
          {tx.completed_at ? <TicketRow label="Finalizada">{formatDateTime(tx.completed_at, tx.asset_code)}</TicketRow> : null}
          {tx.refunded ? <TicketRow label="Reembolso">Sí</TicketRow> : null}
        </dl>

        {!isTerminal(tx.status) ? (
          <p className="text-muted mt-4 text-center text-xs">Esta página se actualiza sola cada 5 segundos.</p>
        ) : null}

        <TicketFooter date={formatDateTime(tx.started_at, tx.asset_code)} id={tx.id} />
      </TicketFrame>
      <CloseHint />
    </>
  );
}
