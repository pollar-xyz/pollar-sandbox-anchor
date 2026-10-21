import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { safeRead } from '@/lib/admin/action-result';
import { requireAdmin } from '@/lib/admin/session';
import { db } from '@/lib/db';
import { TERMINAL_STATUSES } from '@/lib/sep24/transitions';
import { ActionForm } from '../../../_components/action-form';
import { Badge, Card, ErrorBox, Field, formatDate, inputClass, PageHeader, statusTone } from '../../../_components/ui';
import { forceStatusAction, markDepositReceivedAction } from '../../actions';
import { SEP24_STATUSES } from '../../statuses';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'object' && !('toFixed' in value)) return JSON.stringify(value, null, 2);
  return String(value);
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const result = await safeRead(() =>
    db().transaction.findUnique({ where: { id }, include: { events: { orderBy: { created_at: 'asc' } } } }),
  );
  if (result.ok && !result.data) notFound();

  return (
    <>
      <Link href="/admin/transacciones" className="text-brand text-sm hover:underline">
        Volver a transacciones
      </Link>
      {!result.ok || !result.data ? (
        <div className="mt-4">
          <ErrorBox error={result.ok ? 'No encontrada' : result.error} />
        </div>
      ) : (
        <Detail tx={result.data} />
      )}
    </>
  );
}

type TxWithEvents = Prisma.TransactionGetPayload<{ include: { events: true } }>;

function Detail({ tx }: { tx: TxWithEvents }) {
  const { events, ...fields } = tx;
  const terminal = (TERMINAL_STATUSES as readonly string[]).includes(tx.status);

  return (
    <div className="mt-4">
      <PageHeader title={`${tx.kind === 'deposit' ? 'Depósito' : 'Retiro'} ${tx.asset_code}`} description={tx.id}>
        <Badge tone={statusTone(tx.status)}>{tx.status}</Badge>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Campos" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            {Object.entries(fields).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted font-mono text-xs sm:pt-0.5">{key}</dt>
                <dd className="font-mono text-xs break-all whitespace-pre-wrap">{display(value)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          {tx.kind === 'deposit' && !terminal && (
            <Card title="Marcar depósito recibido">
              <p className="text-muted mb-3 text-sm">Paga el asset on-chain al usuario y completa el depósito.</p>
              <ActionForm
                action={markDepositReceivedAction}
                submitLabel="Marcar depósito recibido"
                confirmMessage="Se va a pagar el asset on-chain al usuario. ¿Continuar?"
              >
                <input type="hidden" name="id" value={tx.id} />
              </ActionForm>
            </Card>
          )}
          <Card title="Forzar estado">
            <ActionForm
              action={forceStatusAction}
              submitLabel="Forzar estado"
              variant="danger"
              confirmMessage="Esto cambia el estado sin validar el flujo. ¿Continuar?"
            >
              <input type="hidden" name="id" value={tx.id} />
              <Field label="Nuevo estado">
                <select name="status" defaultValue={tx.status} className={inputClass}>
                  {SEP24_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nota (obligatoria)">
                <textarea name="note" required rows={2} maxLength={500} className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </div>

      <Card title="Historial" className="mt-4">
        {events.length === 0 ? (
          <p className="text-muted text-sm">Sin eventos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">De</th>
                  <th className="py-2 pr-4">A</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(e.created_at)}</td>
                    <td className="py-2 pr-4">{e.from_status ?? '-'}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={statusTone(e.to_status)}>{e.to_status}</Badge>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{e.actor}</td>
                    <td className="py-2 break-words">{e.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
