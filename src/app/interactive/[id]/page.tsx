import type { Transaction } from '@prisma/client';
import { redirect } from 'next/navigation';
import { AmountForm } from '@/components/anchor/amount-form';
import { AssetLine, CardHeader } from '@/components/anchor/shell';
import { TicketRow } from '@/components/anchor/ticket-parts';
import { TransactionView } from '@/components/anchor/transaction-view';
import { FIAT_META, type FiatCode } from '@/lib/assets';
import { db } from '@/lib/db';
import { checkLimits, quoteFee, type FeeQuote, type Operation } from '@/lib/fees';
import { fakeKycDefaults, getKyc, isKycApproved, kycDataSchema } from '@/lib/kyc';
import { getSettings, type Settings } from '@/lib/settings';
import { normalizeAmountInput } from '../_lib/amount-input';
import { cleanBankAccount, currencySymbol, fiatOf, formatAmount, validateBankAccount } from '../_lib/format';
import { readSession } from '../_lib/session';
import { ConfirmStep } from './_steps/confirm-step';
import { DestinationStep, type DestinationValues } from './_steps/destination-step';
import { KycStep } from './_steps/kyc-step';
import { MethodStep } from './_steps/method-step';
import { ExpiredStep, UnsupportedStep } from './_steps/notice-step';
import { SandboxControls } from './_steps/sandbox-controls';
import { confirmDepositAction, confirmWithdrawAction } from './actions';

type Query = Record<string, string | string[] | undefined>;

export default async function InteractivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const get = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === 'string' ? value : undefined;
  };

  const token = get('token');
  if (token) redirect(`/interactive/${encodeURIComponent(id)}/session?token=${encodeURIComponent(token)}`);

  const claims = await readSession(id);
  if (!claims) return <ExpiredStep id={id} />;
  const tx = await db().transaction.findUnique({ where: { id } });
  if (!tx || tx.account !== claims.account) return <ExpiredStep id={id} />;

  // Once submitted, the transaction status drives the page; the ?step= params only matter while incomplete.
  if (tx.status !== 'incomplete') {
    const controls =
      tx.kind === 'deposit' && tx.status === 'pending_user_transfer_start' ? (
        <SandboxControls id={id} autoReceiveSeconds={(await getSettings()).auto_receive_seconds} />
      ) : undefined;
    return <TransactionView tx={tx} sandboxControls={controls} />;
  }

  const asset = fiatOf(tx.asset_code);
  if (!asset) return <UnsupportedStep assetCode={tx.asset_code} />;

  const kyc = await getKyc(claims.account);
  if (!isKycApproved(kyc)) {
    const saved = kycDataSchema.safeParse(kyc?.data);
    const defaults = saved.success
      ? saved.data
      : fakeKycDefaults(claims.account, FIAT_META[asset].country === 'PE' ? 'PE' : 'AR');
    return <KycStep id={id} defaults={defaults} />;
  }

  const settings = await getSettings();
  const ctx: FlowContext = { id, tx, asset, settings, get };
  return tx.kind === 'deposit' ? <DepositFlow {...ctx} /> : <WithdrawFlow {...ctx} />;
}

interface FlowContext {
  id: string;
  tx: Transaction;
  asset: FiatCode;
  settings: Settings;
  get: (key: string) => string | undefined;
}

function stepHref(id: string, params: Record<string, string>): string {
  return `/interactive/${encodeURIComponent(id)}?${new URLSearchParams(params).toString()}`;
}

type AmountCheck = { ok: true; amount: string; quote: FeeQuote } | { ok: false; error: string };

function checkAmount(raw: string | undefined, settings: Settings, asset: FiatCode, op: Operation): AmountCheck {
  const amount = normalizeAmountInput(raw ?? '');
  const { min, max } = settings.fees[asset][op];
  const range = `Ingrese un monto entre ${formatAmount(min)} y ${formatAmount(max)}`;
  if (!amount) return { ok: false, error: range };
  if (!checkLimits(settings, asset, op, amount).ok) return { ok: false, error: range };
  return { ok: true, amount, quote: quoteFee(settings, asset, op, amount) };
}

function AmountScreen({
  ctx,
  op,
  nextStep,
  backHref,
  error,
}: {
  ctx: FlowContext;
  op: Operation;
  nextStep: string;
  backHref?: string;
  error?: string;
}) {
  const { id, tx, asset, settings, get } = ctx;
  return (
    <>
      <CardHeader title={op === 'deposit' ? 'Depósito' : 'Retiro'} subtitle="Vía Transferencia Bancaria">
        <AssetLine assetCode={asset} name={FIAT_META[asset].name} />
      </CardHeader>
      <AmountForm
        formAction={`/interactive/${encodeURIComponent(id)}`}
        hidden={{ step: nextStep }}
        asset={asset}
        symbol={FIAT_META[asset].symbol}
        settings={settings}
        operation={op}
        amountLabel={op === 'deposit' ? 'Monto a Transferir' : 'Monto a Retirar'}
        initialAmount={get('amount') ?? formatAmount(tx.amount_expected) ?? ''}
        serverError={error}
        backHref={backHref}
      />
    </>
  );
}

function DepositFlow(ctx: FlowContext) {
  const { id, asset, settings, get } = ctx;
  const step = get('step');

  if (step === 'confirm') {
    const check = checkAmount(get('amount'), settings, asset, 'deposit');
    if (!check.ok)
      return (
        <AmountScreen
          ctx={ctx}
          op="deposit"
          nextStep="confirm"
          backHref={stepHref(id, { step: 'method' })}
          error={check.error}
        />
      );
    const fees = settings.fees[asset].deposit;
    return (
      <ConfirmStep
        title="Depósito"
        amountLabel="Monto a Transferir"
        assetCode={asset}
        symbol={currencySymbol(asset)}
        quote={check.quote}
        feeFixed={fees.fee_fixed}
        feePercent={fees.fee_percent}
        notice={
          <>
            Al confirmar te mostraremos las <strong className="text-ink font-semibold">instrucciones</strong> para realizar la
            transferencia bancaria.
          </>
        }
        action={confirmDepositAction.bind(null, id)}
        hidden={{ amount: check.amount }}
        modifyHref={stepHref(id, { step: 'amount', amount: check.amount })}
      />
    );
  }

  if (step === 'amount') {
    return <AmountScreen ctx={ctx} op="deposit" nextStep="confirm" backHref={stepHref(id, { step: 'method' })} />;
  }

  return <MethodStep amountHref={stepHref(id, { step: 'amount' })} assetCode={asset} assetName={FIAT_META[asset].name} />;
}

function readDestination(get: FlowContext['get']): DestinationValues {
  return {
    holder: get('holder')?.trim() ?? '',
    bankAccount: get('bank_account')?.trim() ?? '',
    bankName: get('bank_name')?.trim() ?? '',
  };
}

function WithdrawFlow(ctx: FlowContext) {
  const { id, asset, settings, get } = ctx;
  const step = get('step');
  if (step !== 'destination' && step !== 'confirm') return <AmountScreen ctx={ctx} op="withdraw" nextStep="destination" />;

  const check = checkAmount(get('amount'), settings, asset, 'withdraw');
  if (!check.ok) return <AmountScreen ctx={ctx} op="withdraw" nextStep="destination" error={check.error} />;

  const values = readDestination(get);
  const destinationProps = {
    formAction: `/interactive/${encodeURIComponent(id)}`,
    amount: check.amount,
    asset,
    values,
    backHref: stepHref(id, { step: 'amount', amount: check.amount }),
  };
  if (step === 'destination') return <DestinationStep {...destinationProps} errors={{}} />;

  const bankAccount = cleanBankAccount(values.bankAccount);
  const errors = {
    holder: values.holder ? undefined : 'Ingresá el titular de la cuenta',
    bankAccount: validateBankAccount(asset, bankAccount) ?? undefined,
  };
  if (errors.holder || errors.bankAccount) return <DestinationStep {...destinationProps} errors={errors} />;

  const fees = settings.fees[asset].withdraw;
  const field = FIAT_META[asset].bankField;
  const hidden = { amount: check.amount, holder: values.holder, bank_account: bankAccount, bank_name: values.bankName };
  return (
    <ConfirmStep
      title="Retiro"
      amountLabel="Monto a Retirar"
      assetCode={asset}
      symbol={currencySymbol(asset)}
      quote={check.quote}
      feeFixed={fees.fee_fixed}
      feePercent={fees.fee_percent}
      details={
        <dl className="divide-y divide-gray-100 rounded-xl px-4 py-1 shadow-[0_2px_18px_-6px_rgba(0,0,0,0.15)]">
          <TicketRow label="Titular">{values.holder}</TicketRow>
          <TicketRow label={field} mono>
            {bankAccount}
          </TicketRow>
          {values.bankName ? <TicketRow label="Banco">{values.bankName}</TicketRow> : null}
        </dl>
      }
      notice={`Al confirmar te indicaremos a qué cuenta enviar los ${asset} desde tu wallet.`}
      action={confirmWithdrawAction.bind(null, id)}
      hidden={hidden}
      modifyHref={stepHref(id, { step: 'destination', ...hidden })}
    />
  );
}
