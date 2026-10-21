import type { ReactNode } from 'react';

export const inputClass =
  'rounded-md border border-gray-300 bg-surface px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none';

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="text-muted mt-1 text-sm">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-surface rounded-lg border border-gray-200 p-4 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorBox({ title = 'No se pudo cargar', error }: { title?: string; error: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p className="font-medium">{title}</p>
      <p className="mt-1 font-mono text-xs break-words">{error}</p>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-gray-100 text-gray-700',
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-900',
    bad: 'bg-red-100 text-red-800',
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function PublicKey({ value }: { value: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/account/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
      className="text-brand font-mono text-xs break-all hover:underline"
    >
      {value}
    </a>
  );
}

export function AssetLabel({ asset }: { asset: string }) {
  const [code, issuer] = asset.split(':');
  return (
    <span title={asset} className="font-medium">
      {code}
      {issuer && <span className="text-muted ml-1 font-mono text-xs">{`${issuer.slice(0, 4)}...${issuer.slice(-4)}`}</span>}
    </span>
  );
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

export function statusTone(status: string): 'neutral' | 'ok' | 'warn' | 'bad' {
  if (status === 'completed') return 'ok';
  if (['error', 'expired', 'refunded', 'too_small', 'too_large', 'no_market'].includes(status)) return 'bad';
  if (status.startsWith('pending')) return 'warn';
  return 'neutral';
}

export function buttonClass(variant: 'primary' | 'secondary' | 'danger'): string {
  const base = 'rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60';
  if (variant === 'danger') return `${base} bg-red-600 text-white hover:bg-red-700`;
  if (variant === 'secondary') return `${base} border border-gray-300 bg-surface text-ink hover:bg-canvas`;
  return `${base} bg-brand text-white hover:bg-brand-dark`;
}
