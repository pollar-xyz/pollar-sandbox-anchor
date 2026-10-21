import { safeRead } from '@/lib/admin/action-result';
import { requireAdmin } from '@/lib/admin/session';
import { currentGeneration } from '@/lib/accounts';
import { getAccountStatus } from '@/lib/liquidity';
import { ActionForm } from '../_components/action-form';
import { AssetLabel, Badge, Card, ErrorBox, Field, inputClass, PageHeader, PublicKey } from '../_components/ui';
import { bootstrapAction, rebootstrapAction } from './actions';

export default async function StatusPage() {
  await requireAdmin();
  const [generation, accounts] = await Promise.all([safeRead(currentGeneration), safeRead(() => getAccountStatus())]);

  return (
    <>
      <PageHeader title="Estado" description="Cuentas Stellar del anchor en la generación actual.">
        <a href="/.well-known/stellar.toml" target="_blank" className="text-brand text-sm hover:underline">
          Ver stellar.toml
        </a>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Generación">
          {generation.ok ? (
            <p className="text-3xl font-semibold">{generation.data || '-'}</p>
          ) : (
            <ErrorBox error={generation.error} />
          )}
          <p className="text-muted mt-2 text-xs">Cada reset de testnet crea una generación nueva de cuentas.</p>
        </Card>

        <Card title="Bootstrap">
          <p className="text-muted mb-3 text-sm">
            Crea y fondea las cuentas que falten en la generación actual. Es idempotente.
          </p>
          <ActionForm action={bootstrapAction} submitLabel="Bootstrap" />
        </Card>

        <Card title="Re-bootstrap (testnet reset)">
          <p className="text-muted mb-3 text-sm">
            Retira la generación actual y crea una nueva, liquidez incluida. Usalo solo después de un reset de testnet.
          </p>
          <ActionForm
            action={rebootstrapAction}
            submitLabel="Re-bootstrap"
            variant="danger"
            confirmMessage="Esto retira todas las cuentas actuales. ¿Continuar?"
          >
            <Field label="Escribí RESET para confirmar">
              <input name="confirm" autoComplete="off" required pattern="RESET" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      </div>

      <Card title="Cuentas activas" className="mt-4">
        {!accounts.ok ? (
          <ErrorBox error={accounts.error} />
        ) : accounts.data.length === 0 ? (
          <p className="text-muted text-sm">No hay cuentas. Corré el bootstrap.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Cuenta</th>
                  <th className="py-2 pr-4">On-chain</th>
                  <th className="py-2">Balances</th>
                </tr>
              </thead>
              <tbody>
                {accounts.data.map(({ account, exists, balances }) => (
                  <tr key={account.id} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-4">
                      <p className="font-medium">{account.role}</p>
                      {account.label && <p className="text-muted text-xs">{account.label}</p>}
                    </td>
                    <td className="max-w-xs py-2 pr-4">
                      <PublicKey value={account.public_key} />
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={exists ? 'ok' : 'bad'}>{exists ? 'Existe' : 'No existe'}</Badge>
                    </td>
                    <td className="py-2">
                      {balances.length === 0 ? (
                        <span className="text-muted">-</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {balances.map((b) => (
                            <li key={b.asset} className="flex justify-between gap-4">
                              <AssetLabel asset={b.asset} />
                              <span className="font-mono">{b.balance}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
