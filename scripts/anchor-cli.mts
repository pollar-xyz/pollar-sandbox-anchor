// Operator CLI for self-hosters and local work, so the anchor can be bootstrapped before the admin login is configured.
// Usage: pnpm cli <command> [args]
//   status | bootstrap | rebootstrap | liquidity-wallet [label] | mint <accountId> <ARS|PEN> <amount>
//   sozu <accountId> | offers [accountId] | depth
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const liquidity = await import('../src/lib/liquidity/index');

const [command, ...args] = process.argv.slice(2);
const actor = 'cli';

function print(value: unknown) {
  console.log(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

function summarize(accounts: { role: string; public_key: string; id: string; generation: number }[]) {
  return accounts.map(({ role, public_key, id, generation }) => ({ role, public_key, id, generation }));
}

switch (command) {
  case 'status': {
    const status = await liquidity.getLiquidityStatus();
    print({
      generation: status.generation,
      accounts: status.accounts.map((a) => ({
        role: a.account.role,
        id: a.account.id,
        key: a.account.public_key,
        exists: a.exists,
        balances: a.balances,
      })),
      offers: status.offers.length,
      usdcAvailable: status.usdcAvailable,
      usdcBelowThreshold: status.usdcBelowThreshold,
    });
    break;
  }
  case 'bootstrap':
    print(summarize(await liquidity.bootstrap(actor)));
    break;
  case 'rebootstrap':
    print(summarize(await liquidity.rebootstrap(actor)));
    break;
  case 'liquidity-wallet':
    print(summarize([await liquidity.createLiquidityWallet(actor, args[0])]));
    break;
  case 'mint':
    print({ txHash: await liquidity.mintToLiquidity(args[0], args[1] as 'ARS' | 'PEN', args[2]) });
    break;
  case 'sozu':
    print(await liquidity.claimSozuUsdc(args[0]));
    break;
  case 'offers':
    print(await liquidity.publishOffers(args[0]));
    break;
  case 'depth':
    print(await liquidity.checkDepth());
    break;
  default:
    console.error(
      'Commands: status | bootstrap | rebootstrap | liquidity-wallet [label] | mint <id> <ARS|PEN> <amount> | sozu <id> | offers [id] | depth',
    );
    process.exitCode = 1;
}

const { db } = await import('../src/lib/db');
await db().$disconnect();
