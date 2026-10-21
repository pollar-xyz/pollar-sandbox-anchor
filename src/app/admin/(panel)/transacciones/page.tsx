import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import { safeRead } from '@/lib/admin/action-result';
import { requireAdmin } from '@/lib/admin/session';
import { FIAT_CODES } from '@/lib/assets';
import { db } from '@/lib/db';
import { ActionForm } from '../../_components/action-form';
import {
  Badge,
  buttonClass,
  Card,
  ErrorBox,
  Field,
  formatDate,
  inputClass,
  PageHeader,
  statusTone,
} from '../../_components/ui';
import { expireStaleAction } from '../actions';
import { SEP24_STATUSES } from '../statuses';

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(params: Awaited<SearchParams>, name: string): string {
  const value = params[name];
  return typeof value === 'string' ? value.trim() : '';
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const filters = {
    kind: param(params, 'kind'),
    status: param(params, 'status'),
    asset: param(params, 'asset'),
    q: param(params, 'q'),
  };
  const page = Math.max(1, Number.parseInt(param(params, 'page'), 10) || 1);

  const where: Prisma.TransactionWhereInput = {
    ...(filters.kind === 'deposit' || filters.kind === 'withdrawal' ? { kind: filters.kind } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.asset ? { asset_code: filters.asset } : {}),
    ...(filters.q
      ? {
          OR: [
            { account: { contains: filters.q, mode: 'insensitive' } },
            { id: filters.q },
            { stellar_transaction_id: filters.q },
            { external_transaction_id: filters.q },
            { withdraw_memo: filters.q },
          ],
        }
      : {}),
  };

  const result = await safeRead(() =>
    db().$transaction([
      db().transaction.count({ where }),
      db().transaction.findMany({ where, orderBy: { started_at: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    ]),
  );

  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `/admin/transacciones?${s}` : '/admin/transacciones';
  };

  return (
    <>
      <PageHeader title="Transacciones" description="Depósitos y retiros SEP-24, más nuevos primero.">
        <ActionForm
          action={expireStaleAction}
          submitLabel="Expirar pendientes"
          variant="secondary"
          confirmMessage="Expira las transacciones que esperan al usuario más de lo configurado. ¿Continuar?"
        />
      </PageHeader>

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Tipo">
            <select name="kind" defaultValue={filters.kind} className={inputClass}>
              <option value="">Todos</option>
              <option value="deposit">deposit</option>
              <option value="withdrawal">withdrawal</option>
            </select>
          </Field>
          <Field label="Estado">
            <select name="status" defaultValue={filters.status} className={inputClass}>
              <option value="">Todos</option>
              {SEP24_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Asset">
            <select name="asset" defaultValue={filters.asset} className={inputClass}>
              <option value="">Todos</option>
              {FIAT_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Cuenta, id, hash o memo">
            <input name="q" defaultValue={filters.q} className={`${inputClass} w-72 max-w-full`} />
          </Field>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
          <Link href="/admin/transacciones" className="text-muted text-sm hover:underline">
            Limpiar
          </Link>
        </form>
      </Card>

      {!result.ok ? (
        <ErrorBox error={result.error} />
      ) : (
        <Card>
          {result.data[1].length === 0 ? (
            <p className="text-muted text-sm">No hay transacciones con esos filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4">Inicio</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Asset</th>
                    <th className="py-2 pr-4 text-right">Monto in</th>
                    <th className="py-2 pr-4 text-right">Monto out</th>
                    <th className="py-2">Cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data[1].map((tx) => (
                    <tr key={tx.id} className="hover:bg-canvas border-t border-gray-100">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <Link href={`/admin/transacciones/${tx.id}`} className="text-brand hover:underline">
                          {formatDate(tx.started_at)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{tx.kind}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={statusTone(tx.status)}>{tx.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">{tx.asset_code}</td>
                      <td className="py-2 pr-4 text-right font-mono">{tx.amount_in?.toString() ?? '-'}</td>
                      <td className="py-2 pr-4 text-right font-mono">{tx.amount_out?.toString() ?? '-'}</td>
                      <td className="py-2 font-mono text-xs" title={tx.account}>
                        {`${tx.account.slice(0, 6)}...${tx.account.slice(-6)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-muted mt-4 flex items-center justify-between text-sm">
            <span>
              {result.data[0]} en total - página {page} de {Math.max(1, Math.ceil(result.data[0] / PAGE_SIZE))}
            </span>
            <div className="flex gap-3">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="text-brand hover:underline">
                  Anterior
                </Link>
              )}
              {page * PAGE_SIZE < result.data[0] && (
                <Link href={pageHref(page + 1)} className="text-brand hover:underline">
                  Siguiente
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
