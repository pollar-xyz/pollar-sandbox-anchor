import type { SozuClaim } from '@prisma/client';
import { safeRead } from '@/lib/admin/action-result';
import { requireAdmin } from '@/lib/admin/session';
import { FIAT_CODES } from '@/lib/assets';
import { db } from '@/lib/db';
import { getLiquidityStatus } from '@/lib/liquidity';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '../../_components/action-form';
import { AssetLabel, Badge, Card, ErrorBox, Field, formatDate, inputClass, PageHeader, PublicKey } from '../../_components/ui';
import {
  consolidateUsdcAction,
  createLiquidityWalletAction,
  mintAction,
  publishOffersAction,
  sozuClaimAction,
} from '../actions';

export default async function LiquidityPage() {
  await requireAdmin();
  const [status, settings] = await Promise.all([safeRead(getLiquidityStatus), safeRead(getSettings)]);
  const wallets = status.ok ? status.data.accounts.filter((a) => a.account.role === 'LIQUIDITY') : [];
  const claims = await safeRead(() => lastClaimsByAccount(wallets.map((w) => w.account.id)));

  return (
    <>
      <PageHeader title="Liquidez" description="Wallets de liquidez, ofertas en el DEX y USDC de testnet.">
        <ActionForm action={publishOffersAction} submitLabel="Republicar ofertas" variant="secondary" />
      </PageHeader>

      {!status.ok ? (
        <ErrorBox error={status.error} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="USDC disponible">
              <p className="text-3xl font-semibold">{status.data.usdcAvailable}</p>
              {status.data.usdcBelowThreshold && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Por debajo del umbral
                  {settings.ok ? ` de ${settings.data.usdc_alert_threshold} USDC` : ''}. Cargá USDC desde Sozu.
                </p>
              )}
              <p className="text-muted mt-2 text-xs">Generación {status.data.generation}</p>
            </Card>

            <Card title="Último claim de Sozu">
              <SozuClaimSummary claim={status.data.lastSozuClaim} />
            </Card>

            <Card title="Generar wallet de liquidez">
              {wallets.length > 0 && (
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Ya hay {wallets.length === 1 ? 'una wallet' : `${wallets.length} wallets`} de liquidez y con una alcanza: ARS
                  y PEN se emiten sin límite y el USDC se carga en la misma wallet una vez por hora. Otra wallet solo duplica
                  las ofertas, y no sirve para saltear el cooldown de Sozu.
                </p>
              )}
              <ActionForm action={createLiquidityWalletAction} submitLabel="Generar wallet">
                <Field label="Etiqueta (opcional)">
                  <input name="label" maxLength={60} className={inputClass} />
                </Field>
                {wallets.length > 0 && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" name="confirmExtra" />
                    Crear otra wallet igual
                  </label>
                )}
              </ActionForm>
            </Card>
          </div>

          <h2 className="mt-8 mb-3 text-lg font-semibold">Wallets</h2>
          {wallets.length === 0 && <p className="text-muted text-sm">No hay wallets de liquidez.</p>}
          <div className="grid gap-4 xl:grid-cols-2">
            {wallets.map(({ account, exists, balances }) => (
              <Card key={account.id}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{account.label || 'Sin etiqueta'}</p>
                    <PublicKey value={account.public_key} />
                  </div>
                  <Badge tone={exists ? 'ok' : 'bad'}>{exists ? 'Existe' : 'No existe'}</Badge>
                </div>
                <ul className="mb-4 space-y-0.5 text-sm">
                  {balances.map((b) => (
                    <li key={b.asset} className="flex justify-between gap-4">
                      <AssetLabel asset={b.asset} />
                      <span className="font-mono">{b.balance}</span>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ActionForm action={mintAction} submitLabel="Emitir">
                    <input type="hidden" name="accountId" value={account.id} />
                    <div className="flex gap-2">
                      <Field label="Asset">
                        <select name="asset" className={inputClass}>
                          {FIAT_CODES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Monto">
                        <input
                          name="amount"
                          required
                          inputMode="decimal"
                          pattern="\d+(\.\d{1,7})?"
                          className={`${inputClass} w-full`}
                        />
                      </Field>
                    </div>
                  </ActionForm>
                  <div className="flex flex-col gap-3">
                    <div>
                      <ActionForm action={sozuClaimAction} submitLabel="Cargar USDC (Sozu)" variant="secondary">
                        <input type="hidden" name="accountId" value={account.id} />
                      </ActionForm>
                      {claims.ok && claims.data[account.id] && (
                        <p className="text-muted mt-1 text-xs">
                          Último: {claims.data[account.id]!.status} {formatDate(claims.data[account.id]!.created_at)}
                          {cooldown(claims.data[account.id]!)}
                        </p>
                      )}
                    </div>
                    <ActionForm action={publishOffersAction} submitLabel="Republicar ofertas" variant="secondary">
                      <input type="hidden" name="accountId" value={account.id} />
                    </ActionForm>
                    {wallets.length > 1 && (
                      <ActionForm action={consolidateUsdcAction} submitLabel="Pasar todo el USDC" variant="secondary">
                        <input type="hidden" name="accountId" value={account.id} />
                        <Field label="A la wallet">
                          <select name="targetId" className={inputClass}>
                            {wallets
                              .filter((w) => w.account.id !== account.id)
                              .map((w) => (
                                <option key={w.account.id} value={w.account.id}>
                                  {w.account.label || `${w.account.public_key.slice(0, 6)}...${w.account.public_key.slice(-4)}`}
                                </option>
                              ))}
                          </select>
                        </Field>
                      </ActionForm>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card title="Ofertas en el DEX" className="mt-8">
            {status.data.offers.length === 0 ? (
              <p className="text-muted text-sm">No hay ofertas publicadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted text-xs uppercase">
                    <tr>
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">Vende</th>
                      <th className="py-2 pr-4">Compra</th>
                      <th className="py-2 pr-4 text-right">Monto</th>
                      <th className="py-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.data.offers.map((o) => (
                      <tr key={o.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4 font-mono text-xs">{o.id}</td>
                        <td className="py-2 pr-4">
                          <AssetLabel asset={o.selling} />
                        </td>
                        <td className="py-2 pr-4">
                          <AssetLabel asset={o.buying} />
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{o.amount}</td>
                        <td className="py-2 text-right font-mono">{o.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function SozuClaimSummary({ claim }: { claim: SozuClaim | null }) {
  if (!claim) return <p className="text-muted text-sm">Todavía no hubo claims.</p>;
  return (
    <div className="space-y-1 text-sm">
      <p>
        <Badge tone={claim.status === 'ok' || claim.status === 'success' ? 'ok' : 'warn'}>{claim.status}</Badge>{' '}
        {claim.amount ? `${claim.amount.toString()} USDC` : ''}
      </p>
      <p className="text-muted text-xs">{formatDate(claim.created_at)}</p>
      {claim.reason && <p className="text-xs">{claim.reason}</p>}
      {cooldown(claim) && <p className="text-xs text-amber-900">{cooldown(claim)}</p>}
    </div>
  );
}

function cooldown(claim: SozuClaim): string {
  if (!claim.next_available_at || claim.next_available_at.getTime() <= Date.now()) return '';
  return ` - Cooldown hasta ${formatDate(claim.next_available_at)}`;
}

async function lastClaimsByAccount(accountIds: string[]): Promise<Record<string, SozuClaim>> {
  if (accountIds.length === 0) return {};
  const rows = await db().sozuClaim.findMany({
    where: { account_id: { in: accountIds } },
    orderBy: { created_at: 'desc' },
    distinct: ['account_id'],
  });
  return Object.fromEntries(rows.map((r) => [r.account_id, r]));
}
