import Link from 'next/link';
import type { ReactNode } from 'react';
import { AssetLine, CardHeader } from '@/components/anchor/shell';

export function MethodStep({
  amountHref,
  assetCode,
  assetName,
}: {
  amountHref: string;
  assetCode: string;
  assetName: string | null;
}) {
  return (
    <>
      <CardHeader title="Depósito" subtitle="Seleccioná cómo querés depositar">
        <AssetLine assetCode={assetCode} name={assetName} />
        <div className="to-brand mx-auto mt-4 h-0.5 w-12 rounded bg-gradient-to-r from-gray-200" />
      </CardHeader>
      <div className="mt-8 grid grid-cols-2 gap-4">
        <Link
          href={amountHref}
          className="focus-visible:ring-brand/30 flex flex-col items-center gap-4 rounded-xl px-3 py-5 text-center shadow-[0_2px_18px_-6px_rgba(0,0,0,0.15)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(27,46,230,0.35)] focus-visible:ring-4 focus-visible:outline-none"
        >
          <span className="text-ink text-sm">Transferencia Bancaria</span>
          <TileIcon>
            <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" strokeLinecap="round" strokeLinejoin="round" />
          </TileIcon>
        </Link>
        <DisabledTile label="Efectivo">
          <path d="M3 7h18v10H3zM7 7v10M17 7v10" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2" />
        </DisabledTile>
        <DisabledTile label="Tarjeta">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M7 15h4" strokeLinecap="round" />
        </DisabledTile>
      </div>
    </>
  );
}

function TileIcon({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`flex size-16 items-center justify-center rounded-full ${muted ? 'bg-gray-50 text-gray-300' : 'bg-violet-50 text-violet-600'}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={1.5}>
        {children}
      </svg>
    </span>
  );
}

function DisabledTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      aria-disabled
      className="flex cursor-not-allowed flex-col items-center gap-3 rounded-xl px-3 py-5 text-center opacity-70 shadow-[0_2px_18px_-6px_rgba(0,0,0,0.1)]"
    >
      <span className="text-muted text-sm">{label}</span>
      <TileIcon muted>{children}</TileIcon>
      <span className="text-muted text-xs">No disponible en sandbox</span>
    </div>
  );
}
