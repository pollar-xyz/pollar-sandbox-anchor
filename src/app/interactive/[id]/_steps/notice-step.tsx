import Link from 'next/link';
import { CardHeader } from '@/components/anchor/shell';
import { secondaryLink } from '@/components/anchor/styles';

export function ExpiredStep({ id }: { id: string }) {
  return (
    <>
      <CardHeader title="El enlace expiró" subtitle="Por seguridad, este enlace es válido por pocos minutos." />
      <p className="text-muted mt-6 text-center text-sm">
        Volvé a tu wallet e iniciá la operación de nuevo para obtener un enlace nuevo. Si ya confirmaste la operación, podés
        seguir su estado igualmente.
      </p>
      <div className="mt-6">
        <Link href={`/transfer24/transaction/more_info/${encodeURIComponent(id)}`} className={secondaryLink}>
          Ver estado de la transacción
        </Link>
      </div>
    </>
  );
}

export function UnsupportedStep({ assetCode }: { assetCode: string }) {
  return (
    <>
      <CardHeader title="Asset no soportado" />
      <p className="text-muted mt-6 text-center text-sm">Este anchor no opera {assetCode}. Solo ARS y PEN.</p>
    </>
  );
}
