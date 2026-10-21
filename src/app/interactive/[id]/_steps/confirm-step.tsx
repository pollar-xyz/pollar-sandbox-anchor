import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatAmount } from '@/app/interactive/_lib/format';
import { ActionForm, type ActionState } from '@/components/anchor/action-form';
import { CardHeader } from '@/components/anchor/shell';
import { secondaryLink } from '@/components/anchor/styles';
import type { FeeQuote } from '@/lib/fees';

/** Shared confirmation card (deposit and withdrawal), modeled on the real anchor's "Confirmar" screen. */
export function ConfirmStep({
  title,
  amountLabel,
  assetCode,
  symbol,
  quote,
  feeFixed,
  feePercent,
  details,
  notice,
  action,
  hidden,
  modifyHref,
}: {
  title: string;
  amountLabel: string;
  assetCode: string;
  symbol: string;
  quote: FeeQuote;
  feeFixed: string;
  feePercent: string;
  details?: ReactNode;
  notice: ReactNode;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  modifyHref: string;
}) {
  return (
    <>
      <CardHeader title={title} subtitle="Vía Transferencia Bancaria" />
      <div className="text-brand mt-10 text-center">
        <p className="text-lg">{amountLabel}</p>
        <p className="mt-1 flex items-baseline justify-center gap-1">
          <span className="text-lg">{symbol}</span>
          <span className="text-5xl font-semibold sm:text-6xl">{quote.amount_in}</span>
        </p>
        <p className="mt-2 text-xs">
          Cargos de operación ({formatAmount(feePercent)}% + {symbol} {formatAmount(feeFixed)}): {symbol} {quote.amount_fee}
        </p>
        <p className="mt-1 text-lg sm:text-xl">
          Monto final a recibir: {assetCode} {quote.amount_out}
        </p>
      </div>
      {details ? <div className="mt-6">{details}</div> : null}
      <p className="text-muted mt-8 text-center text-sm">{notice}</p>
      <div className="mt-6">
        <ActionForm
          action={action}
          submitLabel="Confirmar"
          footer={
            <Link href={modifyHref} className={secondaryLink}>
              Modificar
            </Link>
          }
        >
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </ActionForm>
      </div>
    </>
  );
}
