import type { Transaction } from '@prisma/client';
import { currencySymbol, formatAmount, formatDateTime, statusInfo } from '@/app/interactive/_lib/format';
import { AutoRefresh } from './auto-refresh';
import { InfoBox } from './shell';
import { StatusBadge } from './status-badge';
import { CloseHint, TicketFooter, TicketFrame, TicketRow } from './ticket-parts';

export function WithdrawSend({ tx }: { tx: Transaction }) {
  const status = statusInfo(tx.status, tx.kind);
  const amount = formatAmount(tx.amount_in) ?? formatAmount(tx.amount_expected);

  return (
    <>
      <AutoRefresh active={tx.status === 'pending_user_transfer_start'} />
      <TicketFrame
        title={`Enviá los ${tx.asset_code} desde tu wallet`}
        badge={<StatusBadge label={status.label} tone={status.tone} />}
      >
        <div className="text-center">
          <p className="text-brand">Monto a enviar</p>
          <p className="text-brand mt-1 text-4xl font-semibold sm:text-5xl">
            {currencySymbol(tx.asset_code)} {amount ?? '-'}
          </p>
          <p className="text-muted mt-1 text-sm">{tx.asset_code} en Stellar testnet</p>
        </div>

        <div className="mt-5">
          <InfoBox>
            La wallet que abrió esta página normalmente hace el pago sola. Si pagás a mano, enviá exactamente este monto a la
            cuenta de abajo con el memo indicado; sin el memo no podemos identificar el pago.
          </InfoBox>
        </div>

        <dl className="mt-4 divide-y divide-gray-100">
          <TicketRow label="Cuenta del anchor" mono>
            {tx.withdraw_anchor_account ?? 'Asignando...'}
          </TicketRow>
          <TicketRow label={`Memo (${tx.withdraw_memo_type ?? 'hash'}, base64)`} mono>
            {tx.withdraw_memo ?? 'Asignando...'}
          </TicketRow>
          {formatAmount(tx.amount_out) ? (
            <TicketRow label="Vas a recibir en tu cuenta">
              {currencySymbol(tx.asset_code)} {formatAmount(tx.amount_out)}
            </TicketRow>
          ) : null}
        </dl>

        <p className="text-muted mt-4 text-center text-xs">Esta página se actualiza sola cuando recibimos el pago.</p>

        <TicketFooter date={formatDateTime(tx.started_at, tx.asset_code)} id={tx.id} />
      </TicketFrame>
      <CloseHint />
    </>
  );
}
