import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** The white Pollar mark and wordmark, plus a "Sandbox" tag. Meant for a dark background. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="flex items-center gap-[7px]">
        <Image src="/brand/logo-mark.svg" alt="" width={25.971} height={28} priority />
        <Image src="/brand/logo-text.svg" alt="Pollar" width={103.884} height={18.9534} priority />
      </span>
      <span className="text-sky rounded-full border border-white/15 bg-white/8 px-2.5 py-0.5 text-xs font-semibold tracking-wide">
        Sandbox
      </span>
    </span>
  );
}

/** Night band with the logo, for pages on a light background. */
export function SiteHeader() {
  return (
    <header className="bg-night">
      <div className="mx-auto flex max-w-5xl items-center px-4 py-5">
        <Link href="/" aria-label="Pollar Sandbox">
          <Wordmark />
        </Link>
      </div>
    </header>
  );
}

/** The night sky of accounts.pollar.xyz, with a centered white card. */
export function AnchorShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-night relative flex min-h-[calc(100vh-2.25rem)] flex-col overflow-hidden">
      <Image
        src="/brand/glow-top.svg"
        alt=""
        width={1194.29}
        height={1194.29}
        priority
        className="pointer-events-none absolute top-[-517px] right-[-357px] max-w-none"
      />
      <Image
        src="/brand/glow-bottom.svg"
        alt=""
        width={974.286}
        height={974.286}
        priority
        className="pointer-events-none absolute top-[383px] left-[-437px] max-w-none"
      />
      <Image
        src="/brand/snow-steps.svg"
        alt=""
        width={1440}
        height={960}
        priority
        className="pointer-events-none absolute top-0 left-1/2 max-w-none -translate-x-1/2"
      />
      <div className="relative z-10 px-4 pt-8 sm:px-12 sm:pt-10">
        <Wordmark />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-xl flex-1 px-4 pt-8 pb-16 sm:pt-10">
        <div className="rounded-[28px] bg-white px-5 py-8 shadow-[0_30px_40px_rgba(3,8,26,0.5)] sm:px-10 sm:py-10">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-white/55">
          Pollar Sandbox es un anchor de prueba en Stellar testnet. Los tokens no tienen valor y no se mueve dinero real.
        </p>
      </main>
    </div>
  );
}

export function CardHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="text-center">
      <h1 className="text-ink text-[28px] leading-9 font-bold tracking-[-0.02em] sm:text-[32px]">{title}</h1>
      {subtitle ? <p className="text-muted mt-2 text-sm">{subtitle}</p> : null}
      {children}
    </header>
  );
}

export function AssetLine({ assetCode, name }: { assetCode: string; name: string | null }) {
  return (
    <div className="mt-5 text-center">
      <p className="text-ink text-sm">Asset</p>
      <p className="text-brand text-sm font-medium">
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
