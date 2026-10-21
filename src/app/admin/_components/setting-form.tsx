'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/admin/action-result';
import type { SettingField } from '@/lib/admin/settings-form';
import { ActionMessage } from './action-form';
import { buttonClass, inputClass } from './ui';

const LABELS: Record<string, string> = {
  deposit: 'Depósito',
  withdraw: 'Retiro',
  min: 'Mínimo',
  max: 'Máximo',
  fee_fixed: 'Comisión fija',
  fee_percent: 'Comisión %',
  daily: 'Límite diario',
  spread_bps: 'Spread (bps)',
};

function label(field: SettingField): string {
  if (field.path.length === 0) return 'Valor';
  return field.path.map((p) => LABELS[p] ?? p).join(' / ');
}

export function SettingForm({
  settingKey,
  fields,
  action,
}: {
  settingKey: string;
  fields: SettingField[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={settingKey} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => {
          const error = state?.fieldErrors?.[field.name];
          return (
            <label key={field.name} className="flex flex-col gap-1 text-sm">
              <span className="text-muted text-xs font-medium">{label(field)}</span>
              <input
                key={state?.values?.[field.name] ?? field.value}
                name={field.name}
                defaultValue={state?.values?.[field.name] ?? field.value}
                required
                inputMode={field.kind === 'int' ? 'numeric' : 'decimal'}
                aria-invalid={Boolean(error)}
                className={`${inputClass} ${error ? 'border-red-500' : ''}`}
              />
              <span className="text-muted text-xs">Default: {field.defaultValue}</span>
              {error && <span className="text-xs text-red-700">{error}</span>}
            </label>
          );
        })}
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonClass('primary')}>
          {pending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
