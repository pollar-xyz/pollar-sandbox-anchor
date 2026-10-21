import { AccountRole } from '@prisma/client';
import { Asset } from '@stellar/stellar-sdk';
import { requireActiveAccount } from './accounts';
import { env } from './env';

export const FIAT_CODES = ['ARS', 'PEN'] as const;
export type FiatCode = (typeof FIAT_CODES)[number];

export function isFiatCode(code: string): code is FiatCode {
  return (FIAT_CODES as readonly string[]).includes(code);
}

export const ISSUER_ROLE: Record<FiatCode, AccountRole> = {
  ARS: AccountRole.ISSUER_ARS,
  PEN: AccountRole.ISSUER_PEN,
};

export const FIAT_META: Record<
  FiatCode,
  { name: string; country: string; symbol: string; bankField: string; bankName: string; alias: string }
> = {
  ARS: {
    name: 'Peso Digital (sandbox)',
    country: 'AR',
    symbol: '$',
    bankField: 'CBU',
    bankName: 'Banco Sandbox',
    alias: 'ARS.SANDBOX.POLLAR',
  },
  PEN: {
    name: 'Sol Digital (sandbox)',
    country: 'PE',
    symbol: 'S/',
    bankField: 'CCI',
    bankName: 'Banco Sandbox',
    alias: 'PEN.SANDBOX.POLLAR',
  },
};

export async function fiatAsset(code: FiatCode): Promise<Asset> {
  const issuer = await requireActiveAccount(ISSUER_ROLE[code]);
  return new Asset(code, issuer.public_key);
}

export function usdcAsset(): Asset {
  return new Asset('USDC', env().USDC_ISSUER);
}
