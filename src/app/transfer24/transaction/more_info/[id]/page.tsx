import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AnchorShell } from '@/components/anchor/shell';
import { TransactionView } from '@/components/anchor/transaction-view';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Estado de la transacción | Pollar Sandbox',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public SEP-24 more_info_url: anyone holding the id can read the status, nobody can act on it.
export default async function MoreInfoPage({ params }: { params: Promise<{ id: string }> }) {
  // Without a request-time API the page would be cached after its first render and freeze the status.
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tx = await db().transaction.findUnique({ where: { id } });
  if (!tx) notFound();
  return (
    <AnchorShell>
      <TransactionView tx={tx} />
    </AnchorShell>
  );
}
