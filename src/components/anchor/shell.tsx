import type { ReactNode } from 'react';

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-white">
      <span className="text-brand flex size-8 items-center justify-center rounded-lg bg-white text-base font-bold">P</span>
      <span className="text-lg font-semibold tracking-tight">
        Pollar <span className="font-normal opacity-80">Sandbox</span>
      </span>
    </span>
  );
}

/** Full-width blue band with a centered white card overlapping it. */
export function AnchorShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[calc(100vh-2.25rem)] pb-16">
      <div className="bg-brand h-56 w-full sm:h-64">
        <div className="mx-auto flex max-w-xl items-center px-4 pt-6">
          <Wordmark />
        </div>
      </div>
      <main className="relative mx-auto -mt-36 max-w-xl px-4 sm:-mt-40">
        <div className="bg-surface rounded-2xl px-5 py-8 shadow-[0_10px_40px_-12px_rgba(20,36,184,0.25)] sm:px-12 sm:py-10">
          {children}
        </div>
        <p className="text-muted mt-6 text-center text-xs">
          Pollar Sandbox es un anchor de prueba en Stellar testnet. No tiene relación con ningún anchor real.
        </p>
      </main>
    </div>
  );
}

export function CardHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="text-center">
      <h1 className="text-ink text-3xl font-bold sm:text-4xl">{title}</h1>
      {subtitle ? <p className="text-muted mt-2 text-sm">{subtitle}</p> : null}
      {children}
    </header>
  );
}

export function AssetLine({ assetCode, name }: { assetCode: string; name: string | null }) {
  return (
    <div className="mt-5 text-center">
      <p className="text-ink text-sm">Asset</p>
      <p className="text-sm font-medium text-violet-700">
        {assetCode}
        {name ? <span className="text-muted font-normal"> &middot; {name}</span> : null}
      </p>
    </div>
  );
}

export function InfoBox({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'danger' | 'success' }) {
  const tones = {
    info: 'border-brand bg-info-bg text-brand',
    danger: 'border-red-500 bg-red-50 text-red-800',
    success: 'border-emerald-500 bg-emerald-50 text-emerald-800',
  };
  return <div className={`rounded-md border-l-4 px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
