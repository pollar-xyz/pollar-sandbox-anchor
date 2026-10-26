import Link from 'next/link';
import { SiteHeader } from '@/components/anchor/shell';
import { FIAT_CODES, FIAT_META } from '@/lib/assets';

const LINKS = [
  { href: '/docs', label: 'Docs', body: 'Quickstart, endpoints, statuses, magic amounts and limits.' },
  { href: '/.well-known/stellar.toml', label: 'stellar.toml', body: 'SEP-1: signing key, endpoints and the asset issuers.' },
  { href: '/openapi.yaml', label: 'OpenAPI', body: 'Full reference of the SEP-10 and SEP-24 API.' },
  {
    href: 'https://github.com/pollar-xyz/pollar-sandbox-anchor',
    label: 'GitHub',
    body: 'Apache-2.0 source, to read or to host your own.',
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <section className="bg-night">
        <div className="mx-auto max-w-5xl px-4 pt-10 pb-16">
          <h1 className="text-[32px] leading-10 font-bold tracking-[-0.02em] text-white sm:text-[44px] sm:leading-[52px]">
            <span className="block">Test ramps end to end</span>
            <span className="text-sky block">on Stellar testnet</span>
          </h1>
          <p className="mt-4 max-w-2xl text-white/72">
            Pollar&apos;s public sandbox anchor issues {new Intl.ListFormat('en').format(FIAT_CODES)} on testnet and speaks
            SEP-1, SEP-10 and SEP-24. Deposit and withdraw through hosted pages, force any failure with magic amounts, and swap
            against USDC and XLM on the DEX. No real money moves.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {FIAT_CODES.map((code) => (
              <span key={code} className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-sm text-white">
                <span className="font-semibold">{code}</span>
                <span className="text-white/55"> &middot; {FIAT_META[code].name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>
      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-10 sm:grid-cols-2">
        {LINKS.map(({ href, label, body }) => (
          <Link
            key={href}
            href={href}
            className="hover:border-brand rounded-2xl border border-slate-200 bg-white p-5 transition"
          >
            <p className="text-brand font-semibold">{label}</p>
            <p className="text-muted mt-1 text-sm">{body}</p>
          </Link>
        ))}
      </main>
    </>
  );
}
