import { ActionForm } from '@/components/anchor/action-form';
import { CardHeader, InfoBox } from '@/components/anchor/shell';
import { inputClass, labelClass } from '@/components/anchor/styles';
import type { KycData } from '@/lib/kyc';
import { approveKycAction } from '../actions';

export function KycStep({ id, defaults }: { id: string; defaults: KycData }) {
  return (
    <>
      <CardHeader title="Verificá tu identidad" subtitle="Necesitamos algunos datos antes de operar" />
      <div className="mt-6">
        <InfoBox>Sandbox: los datos son ficticios. Podés aprobar la verificación tal como está.</InfoBox>
      </div>
      <div className="mt-6">
        <ActionForm action={approveKycAction.bind(null, id)} submitLabel="Aprobar verificación" pendingLabel="Verificando...">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="first_name" label="Nombre" defaultValue={defaults.first_name} />
            <Field name="last_name" label="Apellido" defaultValue={defaults.last_name} />
          </div>
          <Field name="email" label="Email" type="email" defaultValue={defaults.email} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="id_type" className={labelClass}>
                Tipo de documento
              </label>
              <select id="id_type" name="id_type" defaultValue={defaults.id_type} className={inputClass}>
                <option value="DNI">DNI</option>
                <option value="CE">CE (Carné de Extranjería)</option>
              </select>
            </div>
            <div>
              <label htmlFor="id_country_code" className={labelClass}>
                País
              </label>
              <select
                id="id_country_code"
                name="id_country_code"
                defaultValue={defaults.id_country_code}
                className={inputClass}
              >
                <option value="AR">Argentina</option>
                <option value="PE">Perú</option>
              </select>
            </div>
          </div>
          <Field name="id_number" label="Número de documento" inputMode="numeric" defaultValue={defaults.id_number} />
        </ActionForm>
      </div>
    </>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  inputMode,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        required
        defaultValue={defaultValue}
        className={inputClass}
      />
    </div>
  );
}
