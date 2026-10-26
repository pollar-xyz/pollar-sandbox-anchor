import Form from 'next/form';
import Link from 'next/link';
import { bankDigitsLabel } from '@/app/interactive/_lib/format';
import { CardHeader } from '@/components/anchor/shell';
import { inputClass, labelClass, primaryButton, secondaryLink } from '@/components/anchor/styles';
import { FIAT_META, type FiatCode } from '@/lib/assets';

export interface DestinationValues {
  holder: string;
  bankAccount: string;
  bankName: string;
}

export function DestinationStep({
  formAction,
  amount,
  asset,
  values,
  errors,
  backHref,
}: {
  formAction: string;
  amount: string;
  asset: FiatCode;
  values: DestinationValues;
  errors: Partial<Record<keyof DestinationValues, string>>;
  backHref: string;
}) {
  const field = FIAT_META[asset].bankField;
  const digits = bankDigitsLabel(asset);
  return (
    <>
      <CardHeader title="Retiro" subtitle="¿A qué cuenta bancaria te enviamos el dinero?" />
      <Form action={formAction} className="mt-8 space-y-4">
        <input type="hidden" name="step" value="confirm" />
        <input type="hidden" name="amount" value={amount} />
        <div>
          <label htmlFor="holder" className={labelClass}>
            Titular de la cuenta
          </label>
          <input id="holder" name="holder" required defaultValue={values.holder} className={inputClass} />
          <FieldError message={errors.holder} />
        </div>
        <div>
          <label htmlFor="bank_account" className={labelClass}>
            {field} ({digits} dígitos)
          </label>
          <input
            id="bank_account"
            name="bank_account"
            required
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values.bankAccount}
            className={`${inputClass} font-mono`}
          />
          <FieldError message={errors.bankAccount} />
        </div>
        <div>
          <label htmlFor="bank_name" className={labelClass}>
            Banco (opcional)
          </label>
          <input id="bank_name" name="bank_name" defaultValue={values.bankName} className={inputClass} />
        </div>
        <p className="text-muted text-center text-xs">Sandbox: podés usar cualquier {field} ficticio con el largo correcto.</p>
        <div className="pt-2">
          <button type="submit" className={primaryButton}>
            Continuar
          </button>
          <Link href={backHref} className={secondaryLink}>
            Volver
          </Link>
        </div>
      </Form>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  ) : null;
}
