# Pollar Sandbox Anchor

A public Stellar **testnet** anchor that behaves like a real ARS / PEN fiat anchor, so wallets and apps can test on-ramps and off-ramps end to end without real money.

- SEP-1 `/.well-known/stellar.toml`
- SEP-10 `/auth`
- SEP-24 `/transfer24/*` with hosted interactive pages
- Assets `ARS` and `PEN` issued by the sandbox on testnet
- Magic amounts to force every failure status
- An admin at `/admin` to bootstrap accounts and manage DEX liquidity (testnet USDC from the Sozu faucet)

Not affiliated with any real anchor. Nothing here moves real money.

## Local development

Requirements: Node 24 (`.nvmrc`), pnpm 11.8 (`corepack enable`), a Postgres database.

```bash
pnpm install
cp .env.example .env.local   # fill it in
pnpm db:migrate
pnpm dev                     # http://localhost:3090
```

SEP-10 and the interactive URLs must be https outside localhost.

## Scripts

| Script            | What it does                     |
| ----------------- | -------------------------------- |
| `pnpm dev`        | Next.js dev server on port 3090  |
| `pnpm build`      | Prisma client + production build |
| `pnpm typecheck`  | `tsc --noEmit`                   |
| `pnpm test`       | Vitest                           |
| `pnpm db:migrate` | Apply Prisma migrations          |

## License

Apache-2.0
