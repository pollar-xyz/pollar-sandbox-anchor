import type { ReactNode } from 'react';

export function TicketFrame({ title, badge, children }: { title: string; badge: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h1 className="text-ink text-center text-2xl font-bold sm:text-3xl">{title}</h1>
      <div className="relative z-10 mt-3 flex justify-center">{badge}</div>
      <div className="-mt-4 rounded-xl px-4 pt-8 pb-4 shadow-[0_2px_18px_-6px_rgba(0,0,0,0.15)] sm:px-6">{children}</div>
    </section>
  );
}

export function TicketRow({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-ink shrink-0 font-medium">{label}</dt>
      <dd className={`text-muted sm:text-right ${mono ? 'font-mono text-xs break-all' : ''}`}>{children}</dd>
    </div>
  );
}

export function TicketFooter({ date, id }: { date: string | null; id: string }) {
  return (
    <div className="text-muted mt-4 border-t border-gray-100 pt-4 text-center text-sm">
      {date ? <p>{date}</p> : null}
      <p className="mt-1 break-all">ID TX: {id}</p>
    </div>
  );
}

export function CloseHint() {
  return <p className="text-muted mt-6 text-center text-xs">Podés cerrar esta ventana y volver a tu billetera.</p>;
}
