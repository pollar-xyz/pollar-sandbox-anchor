import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold">Pollar Sandbox Anchor</h1>
      <p className="text-muted mt-4">
        A public Stellar testnet anchor that behaves like a real ARS / PEN / COP fiat anchor (SEP-1, SEP-10, SEP-24). Use it to
        test on-ramps and off-ramps end to end without real money. Not affiliated with any real anchor.
      </p>
      <ul className="mt-8 list-disc space-y-2 pl-6">
        <li>
          <Link className="text-brand underline" href="/.well-known/stellar.toml">
            stellar.toml
          </Link>
        </li>
        <li>
          <Link className="text-brand underline" href="/docs">
            Docs
          </Link>
        </li>
      </ul>
    </main>
  );
}
