import { safeRead } from '@/lib/admin/action-result';
import { requireAdmin } from '@/lib/admin/session';
import { SETTING_KEYS, settingFields } from '@/lib/admin/settings-form';
import { db } from '@/lib/db';
import { getSettings, type SettingKey } from '@/lib/settings';
import { SettingForm } from '../../_components/setting-form';
import { Card, ErrorBox, formatDate, PageHeader } from '../../_components/ui';
import { saveSettingAction } from '../actions';

const META: Record<SettingKey, { title: string; description: string }> = {
  fees: {
    title: 'Comisiones y límites por operación',
    description: 'Lo que publica /info y se cobra en cada depósito o retiro. Comisión % sobre el monto.',
  },
  rates: {
    title: 'Tasas y spread',
    description: 'Unidades de cada asset por 1 USDC para las ofertas del DEX. Spread en puntos básicos.',
  },
  account_limits: { title: 'Límites diarios por cuenta', description: 'Tope por cuenta Stellar y por asset en 24 horas.' },
  auto_receive_seconds: {
    title: 'Auto-recepción de depósitos (segundos)',
    description: '0 la desactiva. Si no, el depósito se marca recibido esos segundos después de mostrar el ticket.',
  },
  expire_minutes: {
    title: 'Expiración (minutos)',
    description: 'Tiempo que una transacción espera al usuario antes de expirar.',
  },
  usdc_alert_threshold: {
    title: 'Umbral de alerta de USDC',
    description: 'Por debajo de este saldo la página de liquidez muestra una alerta.',
  },
};

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, rows] = await Promise.all([
    safeRead(getSettings),
    safeRead(() => db().setting.findMany({ select: { key: true, updated_at: true, updated_by: true } })),
  ]);
  const updates = rows.ok ? Object.fromEntries(rows.data.map((r) => [r.key, r])) : {};

  return (
    <>
      <PageHeader title="Configuración" description="Valores editables. Los que no se tocaron usan el default." />
      {!settings.ok ? (
        <ErrorBox error={settings.error} />
      ) : (
        <div className="flex flex-col gap-4">
          {SETTING_KEYS.map((key) => {
            const update = updates[key];
            return (
              <Card key={key}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{META[key].title}</h2>
                    <p className="text-muted text-sm">{META[key].description}</p>
                  </div>
                  <p className="text-muted text-xs">
                    {update ? `Editado por ${update.updated_by ?? '-'} el ${formatDate(update.updated_at)}` : 'Default'}
                  </p>
                </div>
                <SettingForm settingKey={key} fields={settingFields(key, settings.data[key])} action={saveSettingAction} />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
