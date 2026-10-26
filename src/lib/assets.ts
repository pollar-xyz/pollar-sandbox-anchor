import { AccountRole } from '@prisma/client';
import { Asset } from '@stellar/stellar-sdk';
import { requireActiveAccount } from './accounts';
import { env } from './env';

export const FIAT_CODES = ['ARS', 'PEN', 'COP'] as const;
export type FiatCode = (typeof FIAT_CODES)[number];

export function isFiatCode(code: string): code is FiatCode {
  return (FIAT_CODES as readonly string[]).includes(code);
}

export const ISSUER_ROLE: Record<FiatCode, AccountRole> = {
  ARS: AccountRole.ISSUER_ARS,
  PEN: AccountRole.ISSUER_PEN,
  COP: AccountRole.ISSUER_COP,
};

export interface FiatMeta {
  name: string;
  country: 'AR' | 'PE' | 'CO';
  symbol: string;
  bankField: string;
  /** Digits a destination bank account must have. Colombia has no fixed-length interbank number. */
  bankDigits: { min: number; max: number };
  bankName: string;
  alias: string;
  timeZone: string;
}

export const FIAT_META: Record<FiatCode, FiatMeta> = {
  ARS: {
    name: 'Peso Digital Sandbox',
    country: 'AR',
    symbol: '$',
    bankField: 'CBU',
    bankDigits: { min: 22, max: 22 },
    bankName: 'Banco Sandbox',
    alias: 'ARS.SANDBOX.POLLAR',
    timeZone: 'America/Argentina/Buenos_Aires',
  },
  PEN: {
    name: 'Sol Digital Sandbox',
    country: 'PE',
    symbol: 'S/',
    bankField: 'CCI',
    bankDigits: { min: 20, max: 20 },
    bankName: 'Banco Sandbox',
    alias: 'PEN.SANDBOX.POLLAR',
    timeZone: 'America/Lima',
  },
  COP: {
    name: 'Peso COP Sandbox',
    country: 'CO',
    symbol: '$',
    bankField: 'Número de cuenta',
    bankDigits: { min: 10, max: 16 },
    bankName: 'Banco Sandbox',
    alias: 'COP.SANDBOX.POLLAR',
    timeZone: 'America/Bogota',
  },
};

export async function fiatAsset(code: FiatCode): Promise<Asset> {
  const issuer = await requireActiveAccount(ISSUER_ROLE[code]);
  return new Asset(code, issuer.public_key);
}

export function usdcAsset(): Asset {
  return new Asset('USDC', env().USDC_ISSUER);
}
