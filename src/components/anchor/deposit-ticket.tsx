import type { Transaction } from '@prisma/client';
import type { ReactNode } from 'react';
import { currencySymbol, formatAmount, formatDateTime, parseExternalExtra, statusInfo } from '@/app/interactive/_lib/format';
import { FIAT_META, isFiatCode } from '@/lib/assets';
import { AutoRefresh } from './auto-refresh';
import { InfoBox } from './shell';
import { StatusBadge } from './status-badge';
import { CloseHint, TicketFooter, TicketFrame } from './ticket-parts';

export function DepositTicket({ tx, sandboxControls }: { tx: Transaction; sandboxControls?: ReactNode }) {
  const status = statusInfo(tx.status, tx.kind);
  const meta = isFiatCode(tx.asset_code) ? FIAT_META[tx.asset_code] : null;
  const extra = parseExternalExtra(tx.external_extra);
  const amount = formatAmount(tx.amount_in) ?? formatAmount(tx.amount_expected);
  const reference = extra.reference ?? '-';
  const bankName = extra.bankName ?? meta?.bankName ?? null;

  return (
    <>
      <AutoRefresh active={tx.status === 'pending_user_transfer_start'} />
      <TicketFrame title="Ticket de Depósito" badge={<StatusBadge label={status.label} tone={status.tone} />}>
        <div className="text-center">
          <p className="text-brand">
            Debés transferir
            <br />
            desde una cuenta propia
          </p>
          <p className="text-brand mt-2 text-4xl font-semibold sm:text-5xl">
            {currencySymbol(tx.asset_code)} {amount ?? '-'}
          </p>
          <p className="text-brand mt-2 text-sm">a la siguiente cuenta</p>

          <p className="text-muted mt-5 text-xs uppercase">{extra.holder ?? 'Pollar Sandbox'}</p>
          {bankName ? <p className="text-muted text-xs">{bankName}</p> : null}
          <dl className="text-muted mt-3 space-y-1 text-sm">
            <div>
              <dt className="text-ink inline font-semibold">{meta?.bankField ?? 'Cuenta'}: </dt>
              <dd className="inline break-all">{extra.bankAccount ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-ink inline font-semibold">Alias: </dt>
              <dd className="inline break-all">{extra.alias ?? meta?.alias ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-ink inline font-semibold">Campo REF: </dt>
              <dd className="inline">{reference}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-5">
          <InfoBox>
            <div className="grid gap-3 text-center font-medium sm:grid-cols-2">
              <p>Recordá especificar el número {reference} en el campo REFERENCIA cuando realices la transferencia.</p>
              <p>El depósito puede demorar hasta 10hs desde el momento en que transfieras.</p>
            </div>
          </InfoBox>
        </div>

        {tx.external_extra_text ? (
          <p className="text-muted mt-4 text-center text-xs whitespace-pre-line">{tx.external_extra_text}</p>
        ) : null}

        <TicketFooter date={formatDateTime(tx.started_at, tx.asset_code)} id={tx.id} />
      </TicketFrame>
      {sandboxControls}
      <CloseHint />
    </>
  );
}
