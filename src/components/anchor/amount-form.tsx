'use client';

import Form from 'next/form';
import Link from 'next/link';
import { useState } from 'react';
import { normalizeAmountInput } from '@/app/interactive/_lib/amount-input';
import type { FiatCode } from '@/lib/assets';
import { checkLimits, quoteFee, type Operation } from '@/lib/fees';
import type { Settings } from '@/lib/settings';
import { fromStroops, toStroops } from '@/lib/amount';
import { primaryButton, secondaryLink } from './styles';

function twoDecimals(value: string): string {
  return fromStroops(toStroops(value), 2);
}

export function AmountForm({
  formAction,
  hidden,
  asset,
  symbol,
  settings,
  operation,
  amountLabel,
  initialAmount,
  serverError,
  backHref,
}: {
  formAction: string;
  hidden: Record<string, string>;
  asset: FiatCode;
  symbol: string;
  settings: Settings;
  operation: Operation;
  amountLabel: string;
  initialAmount: string;
  serverError?: string;
  backHref?: string;
}) {
  const [raw, setRaw] = useState(initialAmount);
  const amount = normalizeAmountInput(raw);
  const limits = amount ? checkLimits(settings, asset, operation, amount) : null;
  const quote = amount && limits?.ok ? quoteFee(settings, asset, operation, amount) : null;
  const { min, max } = settings.fees[asset][operation];
  const showRange = raw.trim() !== '' && !quote;

  return (
    <Form action={formAction} className="mt-6 text-center">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="amount" className="text-brand text-base font-medium">
        {amountLabel}
      </label>
      <div className="text-ink mt-2 flex items-baseline justify-center gap-1">
        <span className="text-4xl sm:text-5xl">{symbol}</span>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0,00"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="w-full max-w-[13ch] bg-transparent text-5xl font-normal outline-none placeholder:text-gray-300 sm:text-6xl"
          style={{ width: `${Math.max(raw.length, 4) + 0.5}ch` }}
        />
      </div>

      <div className="text-brand mx-auto mt-5 flex size-12 items-center justify-center rounded-full shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]">
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M8 4v15M8 4L5 7M8 4l3 3M16 20V5M16 20l-3-3M16 20l3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <p className="text-brand mt-4 text-xs">Monto a Recibir</p>
      <p className={`text-3xl ${quote ? 'text-gray-500' : 'text-gray-300'}`}>
        {symbol}
        {quote ? quote.amount_out : '0.00'}
      </p>

      <p className="text-ink mt-8 min-h-5 text-sm" aria-live="polite">
        {(raw === initialAmount ? serverError : undefined) ??
          (showRange ? `Ingrese un monto entre ${twoDecimals(min)} y ${twoDecimals(max)}` : '')}
      </p>

      <div className="mt-4">
        <button type="submit" disabled={!quote} className={primaryButton}>
          Continuar
        </button>
        {backHref ? (
          <Link href={backHref} className={secondaryLink}>
            Volver
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
