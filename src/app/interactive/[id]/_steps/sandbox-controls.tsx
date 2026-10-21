import { ActionForm } from '@/components/anchor/action-form';
import { MAGIC_AMOUNTS } from '@/lib/magic';
import { simulateReceivedAction } from '../actions';

export function SandboxControls({ id, autoReceiveSeconds }: { id: string; autoReceiveSeconds: number }) {
  return (
    <section className="mt-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-5 text-sm text-amber-950 sm:px-6">
      <h2 className="font-semibold">Controles del sandbox</h2>
      <p className="mt-1 text-amber-900">
        No hace falta transferir nada: simulá que la transferencia llegó y el anchor te envía los tokens en testnet.
      </p>
      <div className="mt-4">
        <ActionForm
          action={simulateReceivedAction.bind(null, id)}
          submitLabel="Simular transferencia recibida"
          pendingLabel="Acreditando..."
          buttonClassName="block w-full rounded-full bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
      {autoReceiveSeconds > 0 ? (
        <p className="mt-3 text-amber-900">
          La recepción automática está activa: el depósito se marca como recibido {autoReceiveSeconds} segundos después de
          mostrar este ticket.
        </p>
      ) : null}
      <details className="mt-3">
        <summary className="cursor-pointer font-medium">Montos mágicos</summary>
        <p className="mt-2 text-amber-900">
          Si el monto confirmado es uno de estos, la transacción termina en el estado indicado en lugar de completarse:
        </p>
        <ul className="mt-2 grid gap-1 font-mono text-xs sm:grid-cols-2">
          {Object.entries(MAGIC_AMOUNTS).map(([amount, outcome]) => (
            <li key={amount}>
              {amount}: {outcome.status}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
