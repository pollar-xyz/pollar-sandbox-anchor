import { fromStroops, toStroops } from '@/lib/amount';
import { FIAT_META, isFiatCode, type FiatCode } from '@/lib/assets';
import { TERMINAL_STATUSES } from '@/lib/sep24/transitions';

type DecimalLike = { toString(): string } | string | number | null | undefined;

/** Two-decimal string for display, or null when the value is missing or not a valid amount. */
export function formatAmount(value: DecimalLike): string | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === 'number' ? value.toFixed(7) : value.toString();
  try {
    return fromStroops(toStroops(s), 2);
  } catch {
    return null;
  }
}

export function fiatOf(assetCode: string): FiatCode | null {
  return isFiatCode(assetCode) ? assetCode : null;
}

export function currencySymbol(assetCode: string): string {
  const fiat = fiatOf(assetCode);
  return fiat ? FIAT_META[fiat].symbol : '';
}

export interface DepositInstructions {
  bankAccount: string | null;
  alias: string | null;
  holder: string | null;
  bankName: string | null;
  reference: string | null;
}

/** external_extra is "<bank number>|<alias>|<holder>|<bank>|<ref>"; any part may be missing. */
export function parseExternalExtra(extra: string | null | undefined): DepositInstructions {
  const parts = (extra ?? '').split('|').map((p) => p.trim());
  const at = (i: number) => (parts[i] ? parts[i] : null);
  return { bankAccount: at(0), alias: at(1), holder: at(2), bankName: at(3), reference: at(4) };
}

export const BANK_ACCOUNT_DIGITS: Record<FiatCode, number> = { ARS: 22, PEN: 20 };

/** Returns an error message, or null when the CBU (ARS) / CCI (PEN) is well formed. */
export function validateBankAccount(asset: FiatCode, value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  const field = FIAT_META[asset].bankField;
  const expected = BANK_ACCOUNT_DIGITS[asset];
  if (!/^\d+$/.test(digits)) return `El ${field} solo puede contener números`;
  if (digits.length !== expected) return `El ${field} debe tener ${expected} dígitos`;
  return null;
}

export function cleanBankAccount(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export type StatusTone = 'pending' | 'success' | 'failure';

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function statusInfo(status: string, kind: 'deposit' | 'withdrawal'): { label: string; tone: StatusTone } {
  switch (status) {
    case 'completed':
      return { label: 'Completada', tone: 'success' };
    case 'error':
      return { label: 'Error', tone: 'failure' };
    case 'refunded':
      return { label: 'Reembolsada', tone: 'failure' };
    case 'expired':
      return { label: 'Expirada', tone: 'failure' };
    case 'too_small':
      return { label: 'Monto demasiado bajo', tone: 'failure' };
    case 'too_large':
      return { label: 'Monto demasiado alto', tone: 'failure' };
    case 'no_market':
      return { label: 'Sin mercado disponible', tone: 'failure' };
    case 'incomplete':
      return { label: 'Incompleta', tone: 'pending' };
    case 'pending_user_transfer_start':
      return {
        label: kind === 'deposit' ? 'Esperando transferencia...' : 'Esperando envío desde tu wallet...',
        tone: 'pending',
      };
    case 'pending_anchor':
      return { label: 'Procesando...', tone: 'pending' };
    case 'pending_stellar':
      return { label: 'Enviando en Stellar...', tone: 'pending' };
    default:
      return { label: 'En proceso...', tone: 'pending' };
  }
}

const TIME_ZONES: Record<FiatCode, string> = { ARS: 'America/Argentina/Buenos_Aires', PEN: 'America/Lima' };

export function formatDateTime(date: Date | null | undefined, assetCode: string): string | null {
  if (!date) return null;
  const fiat = fiatOf(assetCode);
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: fiat ? TIME_ZONES[fiat] : 'UTC',
  }).format(date);
}

export function stellarExpertTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(hash)}`;
}
