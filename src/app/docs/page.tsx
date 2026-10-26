import type { Metadata } from 'next';
import { FIAT_CODES } from '@/lib/assets';
import { SiteHeader } from '@/components/anchor/shell';
import { magicAmounts } from '@/lib/magic';
import { DEFAULT_SETTINGS } from '@/lib/settings';

export const metadata: Metadata = { title: 'Docs - Pollar Sandbox Anchor' };

const HOST = 'https://sandbox-anchor.pollar.xyz';

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">{children}</code>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-16">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  const fees = DEFAULT_SETTINGS.fees;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 text-[15px]">
        <h1 className="text-3xl font-bold">Pollar Sandbox Anchor</h1>
        <p className="text-muted mt-3">
          A public Stellar <strong>testnet</strong> anchor for <Code>ARS</Code>, <Code>PEN</Code> and <Code>COP</Code>. It
          speaks SEP-1, SEP-10 and SEP-24 with the same endpoints, fields, statuses and fees as a real Latin American fiat
          anchor, so you can build and test on-ramps and off-ramps end to end. No real money moves and no real KYC is required.
          It is not affiliated with any real anchor.
        </p>

        <nav className="mt-6 flex flex-wrap gap-3 text-sm">
          {[
            ['quickstart', 'Quickstart'],
            ['endpoints', 'Endpoints'],
            ['statuses', 'Statuses'],
            ['magic', 'Magic amounts'],
            ['usdc', 'Testnet USDC'],
            ['limits', 'Fees and limits'],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-brand underline">
              {label}
            </a>
          ))}
          <a href="/openapi.yaml" className="text-brand underline">
            OpenAPI
          </a>
        </nav>

        <Section id="quickstart" title="Quickstart">
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              Create and fund a testnet account (friendbot) and add a trustline to <Code>ARS</Code>, <Code>PEN</Code> or{' '}
              <Code>COP</Code>. The issuers are listed in{' '}
              <a className="text-brand underline" href="/.well-known/stellar.toml">
                stellar.toml
              </a>
              .
            </li>
            <li>
              Authenticate with SEP-10: <Code>GET /auth?account=G...</Code>, sign the challenge, <Code>POST /auth</Code> to get
              a JWT.
            </li>
            <li>
              Start a deposit or withdrawal: <Code>POST /transfer24/transactions/deposit/interactive</Code> with{' '}
              <Code>{'{ "asset_code": "ARS" }'}</Code>. Open the returned <Code>url</Code> in a new tab.
            </li>
            <li>
              Poll <Code>GET /transfer24/transaction?id=...</Code> until the status is terminal. For withdrawals, send the asset
              to <Code>withdraw_anchor_account</Code> with the hash memo once it appears.
            </li>
          </ol>
          <p>
            In a deposit, the hosted page shows a bank ticket with a fake account. Press{' '}
            <strong>Simular transferencia recibida</strong> and the anchor pays the asset to your account on-chain.
          </p>
          <p>
            Any SEP-24 wallet works, for example{' '}
            <a className="text-brand underline" href="https://demo-wallet.stellar.org">
              demo-wallet.stellar.org
            </a>{' '}
            with home domain <Code>sandbox-anchor.pollar.xyz</Code>.
          </p>
        </Section>

        <Section id="endpoints" title="Endpoints">
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <Code>GET {HOST}/.well-known/stellar.toml</Code> (SEP-1)
            </li>
            <li>
              <Code>GET|POST {HOST}/auth</Code> (SEP-10)
            </li>
            <li>
              <Code>GET {HOST}/transfer24/info</Code>
            </li>
            <li>
              <Code>POST {HOST}/transfer24/transactions/deposit/interactive</Code>
            </li>
            <li>
              <Code>POST {HOST}/transfer24/transactions/withdraw/interactive</Code>
            </li>
            <li>
              <Code>GET {HOST}/transfer24/transaction?id=</Code>
            </li>
            <li>
              <Code>GET {HOST}/transfer24/transactions?asset_code=</Code>
            </li>
          </ul>
          <p>
            Full reference:{' '}
            <a className="text-brand underline" href="/openapi.yaml">
              openapi.yaml
            </a>
            .
          </p>
        </Section>

        <Section id="statuses" title="Statuses">
          <p>
            Deposit and withdrawal: <Code>incomplete</Code> then <Code>pending_user_transfer_start</Code> then{' '}
            <Code>pending_anchor</Code> then <Code>completed</Code>. Failures end in <Code>error</Code>, <Code>refunded</Code>,{' '}
            <Code>expired</Code>, <Code>too_small</Code>, <Code>too_large</Code> or <Code>no_market</Code>.
          </p>
          <p>
            A withdrawal only shows <Code>withdraw_anchor_account</Code> and <Code>withdraw_memo</Code> after the user submits
            the hosted form. Pay exactly <Code>amount_in</Code> with that memo.
          </p>
          <p>Transactions waiting on the user expire after {DEFAULT_SETTINGS.expire_minutes} minutes by default.</p>
        </Section>

        <Section id="magic" title="Magic amounts">
          <p>
            Use these amounts in the hosted form to force an outcome. ARS and PEN share the same amounts; COP uses them times
            1000, so they fall inside its limits.
          </p>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">ARS / PEN</th>
                <th className="py-2">COP</th>
                <th className="py-2">Final status</th>
              </tr>
            </thead>
            <tbody>
              {magicAmounts('ARS').map(({ amount, status }, i) => (
                <tr key={amount} className="border-b border-slate-100">
                  <td className="py-2">
                    <Code>{amount}</Code>
                  </td>
                  <td className="py-2">
                    <Code>{magicAmounts('COP')[i].amount}</Code>
                  </td>
                  <td className="py-2">
                    <Code>{status}</Code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="usdc" title="Testnet USDC">
          <p>
            The sandbox keeps DEX offers between ARS, PEN, COP, XLM and Circle&apos;s testnet USDC (
            <Code>USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5</Code>), so path payments like ARS to USDC work
            on testnet. To get testnet USDC for your own account use the{' '}
            <a className="text-brand underline" href="https://faucet.sozu.capital">
              Sozu faucet
            </a>{' '}
            or{' '}
            <a className="text-brand underline" href="https://faucet.circle.com">
              Circle&apos;s faucet
            </a>
            .
          </p>
        </Section>

        <Section id="limits" title="Fees and limits">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Asset</th>
                <th className="py-2">Operation</th>
                <th className="py-2">Min</th>
                <th className="py-2">Max</th>
                <th className="py-2">Fee</th>
              </tr>
            </thead>
            <tbody>
              {FIAT_CODES.flatMap((asset) =>
                (['deposit', 'withdraw'] as const).map((op) => {
                  const f = fees[asset][op];
                  return (
                    <tr key={`${asset}-${op}`} className="border-b border-slate-100">
                      <td className="py-2">{asset}</td>
                      <td className="py-2">{op}</td>
                      <td className="py-2">{f.min}</td>
                      <td className="py-2">{f.max}</td>
                      <td className="py-2">
                        {f.fee_fixed} + {f.fee_percent}%
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          <p className="text-muted">
            Live values are always in <Code>/transfer24/info</Code>. A public sandbox also applies a daily cap per account and
            rate limits per IP.
          </p>
        </Section>
      </main>
    </>
  );
}
