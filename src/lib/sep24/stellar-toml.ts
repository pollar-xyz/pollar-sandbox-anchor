import { AccountRole } from '@prisma/client';
import { listActiveAccounts } from '../accounts';
import { FIAT_CODES, FIAT_META, ISSUER_ROLE } from '../assets';
import { NETWORK_PASSPHRASE, publicUrl } from '../stellar';

export class NotBootstrappedError extends Error {}

function str(value: string): string {
  return JSON.stringify(value);
}

/** SEP-1 document generated from the active anchor accounts. Also shown live in the admin. */
export async function buildStellarToml(): Promise<string> {
  const accounts = await listActiveAccounts();
  const byRole = new Map(accounts.map((a) => [a.role, a.public_key]));
  const signing = byRole.get(AccountRole.SIGNING);
  const missing = [AccountRole.SIGNING, ...FIAT_CODES.map((c) => ISSUER_ROLE[c])].filter((r) => !byRole.has(r));
  if (!signing || missing.length) throw new NotBootstrappedError(`Missing anchor accounts: ${missing.join(', ')}`);

  const lines = [
    'VERSION = "2.7.0"',
    `NETWORK_PASSPHRASE = ${str(NETWORK_PASSPHRASE)}`,
    `SIGNING_KEY = ${str(signing)}`,
    `WEB_AUTH_ENDPOINT = ${str(publicUrl('/auth'))}`,
    `TRANSFER_SERVER_SEP0024 = ${str(publicUrl('/transfer24'))}`,
    `ACCOUNTS = [${accounts.map((a) => str(a.public_key)).join(', ')}]`,
    '',
    '[DOCUMENTATION]',
    'ORG_NAME = "Pollar Sandbox"',
    `ORG_URL = ${str(publicUrl())}`,
    'ORG_DESCRIPTION = "Stellar testnet anchor for testing ARS, PEN and COP ramps end to end. Not a real anchor: no real money moves."',
  ];
  for (const code of FIAT_CODES) {
    lines.push(
      '',
      '[[CURRENCIES]]',
      `code = ${str(code)}`,
      `issuer = ${str(byRole.get(ISSUER_ROLE[code])!)}`,
      'status = "test"',
      'display_decimals = 2',
      'is_asset_anchored = true',
      'anchor_asset_type = "fiat"',
      `anchor_asset = ${str(code)}`,
      `name = ${str(FIAT_META[code].name)}`,
      `desc = ${str(`Testnet token backed by simulated ${code}. Sandbox only, no value.`)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
