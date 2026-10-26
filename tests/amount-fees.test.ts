import { describe, expect, it } from 'vitest';
import { fromStroops, toStroops } from '@/lib/amount';
import { checkLimits, quoteFee } from '@/lib/fees';
import { FIAT_CODES } from '@/lib/assets';
import { magicAmounts, magicOutcome } from '@/lib/magic';
import { DEFAULT_SETTINGS } from '@/lib/settings';

describe('amount', () => {
  it('round-trips stroops', () => {
    expect(fromStroops(toStroops('200.5'))).toBe('200.5000000');
    expect(fromStroops(toStroops('0.125'), 2)).toBe('0.13');
  });

  it('rejects malformed amounts', () => {
    expect(() => toStroops('1e5')).toThrow();
    expect(() => toStroops('1.12345678')).toThrow();
  });
});

describe('fees', () => {
  it('matches the real anchor deposit ticket: 200 ARS -> 12 fee, 188 out', () => {
    expect(quoteFee(DEFAULT_SETTINGS, 'ARS', 'deposit', '200')).toEqual({
      amount_in: '200.00',
      amount_fee: '12.00',
      amount_out: '188.00',
    });
  });

  it('uses the withdraw percentage', () => {
    expect(quoteFee(DEFAULT_SETTINGS, 'ARS', 'withdraw', '1000').amount_fee).toBe('30.00');
    expect(quoteFee(DEFAULT_SETTINGS, 'PEN', 'deposit', '100').amount_out).toBe('98.00');
  });

  it('enforces min and max', () => {
    expect(checkLimits(DEFAULT_SETTINGS, 'ARS', 'deposit', '10.99')).toMatchObject({ ok: false, reason: 'too_small' });
    expect(checkLimits(DEFAULT_SETTINGS, 'PEN', 'deposit', '3000.01')).toMatchObject({ ok: false, reason: 'too_large' });
    expect(checkLimits(DEFAULT_SETTINGS, 'ARS', 'deposit', '11')).toEqual({ ok: true });
  });
});

describe('magic amounts', () => {
  it('detects magic amounts regardless of formatting', () => {
    expect(magicOutcome('ARS', '13.13')?.status).toBe('error');
    expect(magicOutcome('PEN', '66.6')?.status).toBe('refunded');
    expect(magicOutcome('ARS', '200')).toBeNull();
  });

  it('scales the COP magic amounts by 1000', () => {
    expect(magicOutcome('COP', '13130')?.status).toBe('error');
    expect(magicOutcome('COP', '2999990.00')?.status).toBe('too_large');
    expect(magicOutcome('COP', '13.13')).toBeNull();
    expect(magicOutcome('ARS', '13130')).toBeNull();
  });

  it('keeps every magic amount inside its asset limits', () => {
    for (const code of FIAT_CODES) {
      for (const { amount } of magicAmounts(code)) {
        for (const op of ['deposit', 'withdraw'] as const) {
          expect(checkLimits(DEFAULT_SETTINGS, code, op, amount)).toEqual({ ok: true });
        }
      }
    }
  });
});
