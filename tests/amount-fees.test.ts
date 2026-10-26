import { describe, expect, it } from 'vitest';
import { fromStroops, toStroops } from '@/lib/amount';
import { checkLimits, quoteFee } from '@/lib/fees';
import { FIAT_CODES } from '@/lib/assets';
import { magicAmounts, magicOutcome } from '@/lib/magic';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { TEST_SETTINGS } from './fixtures/settings';

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
    expect(quoteFee(TEST_SETTINGS, 'ARS', 'deposit', '200')).toEqual({
      amount_in: '200.00',
      amount_fee: '12.00',
      amount_out: '188.00',
    });
  });

  it('uses the withdraw percentage', () => {
    expect(quoteFee(TEST_SETTINGS, 'ARS', 'withdraw', '1000').amount_fee).toBe('30.00');
    expect(quoteFee(TEST_SETTINGS, 'PEN', 'deposit', '100').amount_out).toBe('98.00');
  });

  it('enforces min and max', () => {
    expect(checkLimits(TEST_SETTINGS, 'ARS', 'deposit', '10.99')).toMatchObject({ ok: false, reason: 'too_small' });
    expect(checkLimits(TEST_SETTINGS, 'PEN', 'deposit', '3000.01')).toMatchObject({ ok: false, reason: 'too_large' });
    expect(checkLimits(TEST_SETTINGS, 'ARS', 'deposit', '11')).toEqual({ ok: true });
  });

  it('ships defaults between 1 and 10 USD per operation at the default rates', () => {
    for (const code of FIAT_CODES) {
      const rate = Number(DEFAULT_SETTINGS.rates[code]);
      for (const op of ['deposit', 'withdraw'] as const) {
        const { min, max } = DEFAULT_SETTINGS.fees[code][op];
        expect(Number(min) / rate).toBeCloseTo(1, 6);
        expect(Number(max) / rate).toBeCloseTo(10, 6);
      }
      expect(Number(DEFAULT_SETTINGS.account_limits[code].daily)).toBeGreaterThanOrEqual(
        Number(DEFAULT_SETTINGS.fees[code].deposit.max),
      );
    }
  });
});

describe('magic amounts', () => {
  it('matches on the cents for every asset', () => {
    expect(magicOutcome('ARS', '2000.13')?.status).toBe('error');
    expect(magicOutcome('PEN', '5.66')?.status).toBe('refunded');
    expect(magicOutcome('COP', '40000.99')?.status).toBe('too_large');
    expect(magicOutcome('ARS', '13.1')).toBeNull();
    expect(magicOutcome('ARS', '2000')).toBeNull();
    expect(magicOutcome('ARS', '2000.135')).toBeNull();
  });

  it('keeps every example inside the default limits', () => {
    for (const code of FIAT_CODES) {
      for (const { example } of magicAmounts(code)) {
        for (const op of ['deposit', 'withdraw'] as const) {
          expect(checkLimits(DEFAULT_SETTINGS, code, op, example)).toEqual({ ok: true });
        }
      }
    }
  });
});
