import { describe, expect, it } from 'vitest';
import { normalizeAmountInput } from '@/app/interactive/_lib/amount-input';
import {
  cleanBankAccount,
  formatAmount,
  isTerminal,
  parseExternalExtra,
  statusInfo,
  stellarExpertTxUrl,
  validateBankAccount,
} from '@/app/interactive/_lib/format';

describe('parseExternalExtra', () => {
  it('splits the five parts of the deposit instructions', () => {
    expect(parseExternalExtra('3220001805007091710024|ARS.SANDBOX.POLLAR|POLLAR SANDBOX|Banco Sandbox|1903393')).toEqual({
      bankAccount: '3220001805007091710024',
      alias: 'ARS.SANDBOX.POLLAR',
      holder: 'POLLAR SANDBOX',
      bankName: 'Banco Sandbox',
      reference: '1903393',
    });
  });

  it('tolerates missing, empty and null parts', () => {
    expect(parseExternalExtra(null)).toEqual({ bankAccount: null, alias: null, holder: null, bankName: null, reference: null });
    expect(parseExternalExtra('123||HOLDER')).toEqual({
      bankAccount: '123',
      alias: null,
      holder: 'HOLDER',
      bankName: null,
      reference: null,
    });
  });
});

describe('validateBankAccount', () => {
  it('requires a 22 digit CBU for ARS', () => {
    expect(validateBankAccount('ARS', '3220001805007091710024')).toBeNull();
    expect(validateBankAccount('ARS', '322000180500709171002')).toBe('El CBU debe tener 22 dígitos');
    expect(validateBankAccount('ARS', '32200018050070917100AB')).toBe('El CBU solo puede contener números');
  });

  it('requires a 20 digit CCI for PEN and ignores spaces and dashes', () => {
    expect(validateBankAccount('PEN', '002-193-001234567890-12')).toBe(null);
    expect(validateBankAccount('PEN', '3220001805007091710024')).toBe('El CCI debe tener 20 dígitos');
    expect(cleanBankAccount('002 193-0012')).toBe('0021930012');
  });

  it('accepts a COP account number of 10 to 16 digits', () => {
    expect(validateBankAccount('COP', '0123456789')).toBeNull();
    expect(validateBankAccount('COP', '0123-4567-8901-2345')).toBeNull();
    expect(validateBankAccount('COP', '012345678')).toBe('El Número de cuenta debe tener entre 10 y 16 dígitos');
    expect(validateBankAccount('COP', '01234567890123456')).toBe('El Número de cuenta debe tener entre 10 y 16 dígitos');
  });
});

describe('normalizeAmountInput', () => {
  it('accepts comma or dot decimals and a currency prefix', () => {
    expect(normalizeAmountInput('200')).toBe('200');
    expect(normalizeAmountInput('200,50')).toBe('200.50');
    expect(normalizeAmountInput('$ 13.13')).toBe('13.13');
    expect(normalizeAmountInput('S/ 20,')).toBe('20');
  });

  it('rejects garbage, zero and thousands separators', () => {
    expect(normalizeAmountInput('')).toBeNull();
    expect(normalizeAmountInput('abc')).toBeNull();
    expect(normalizeAmountInput('0')).toBeNull();
    expect(normalizeAmountInput('1.000,50')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats decimals to two places and survives null', () => {
    expect(formatAmount('200')).toBe('200.00');
    expect(formatAmount({ toString: () => '188.0000000' })).toBe('188.00');
    expect(formatAmount(null)).toBeNull();
    expect(formatAmount('not a number')).toBeNull();
  });

  it('maps statuses to tones', () => {
    expect(statusInfo('completed', 'deposit').tone).toBe('success');
    expect(statusInfo('no_market', 'withdrawal').tone).toBe('failure');
    expect(statusInfo('pending_user_transfer_start', 'deposit').label).toBe('Esperando transferencia...');
    expect(statusInfo('something_new', 'deposit').tone).toBe('pending');
    expect(isTerminal('refunded')).toBe(true);
    expect(isTerminal('pending_anchor')).toBe(false);
  });

  it('links to the testnet explorer', () => {
    expect(stellarExpertTxUrl('abc')).toBe('https://stellar.expert/explorer/testnet/tx/abc');
  });
});
