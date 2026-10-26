import { describe, expect, it } from 'vitest';
import { isSettingKey, parseSettingForm, SETTING_KEYS, settingFields } from '@/lib/admin/settings-form';
import { DEFAULT_SETTINGS } from '@/lib/settings';

function reader(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

function formOf<K extends keyof typeof DEFAULT_SETTINGS>(key: K, current = DEFAULT_SETTINGS[key]) {
  return Object.fromEntries(settingFields(key, current).map((f) => [f.name, f.value]));
}

describe('settings form', () => {
  it('covers every setting key', () => {
    expect(SETTING_KEYS.sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(isSettingKey('fees')).toBe(true);
    expect(isSettingKey('nope')).toBe(false);
  });

  it('round-trips the defaults of every key', () => {
    for (const key of SETTING_KEYS) {
      expect(parseSettingForm(key, reader(formOf(key)))).toEqual({ ok: true, value: DEFAULT_SETTINGS[key] });
    }
  });

  it('builds nested fields with current values and defaults', () => {
    const current = { ...DEFAULT_SETTINGS.rates, ARS: '1500' };
    const fields = settingFields('rates', current);
    const ars = fields.find((f) => f.name === 'rates.ARS');
    expect(ars).toMatchObject({ value: '1500', defaultValue: '1450', kind: 'decimal', path: ['ARS'] });
    expect(fields.find((f) => f.name === 'rates.spread_bps')).toMatchObject({ kind: 'int', value: '100' });
    expect(settingFields('expire_minutes', 30)).toEqual([
      { name: 'expire_minutes', path: [], kind: 'int', value: '30', defaultValue: '60' },
    ]);
  });

  it('parses edited values with the right types', () => {
    const values = { ...formOf('rates'), 'rates.PEN': ' 3.85 ', 'rates.spread_bps': '250' };
    const result = parseSettingForm('rates', reader(values));
    expect(result).toEqual({ ok: true, value: { ARS: '1450', PEN: '3.85', COP: '4000', XLM: '4', spread_bps: 250 } });
  });

  it('reports invalid leaves by field name', () => {
    const values = { ...formOf('fees'), 'fees.ARS.deposit.fee_percent': '-1', 'fees.PEN.withdraw.min': 'abc' };
    const result = parseSettingForm('fees', reader(values));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['fees.ARS.deposit.fee_percent', 'fees.PEN.withdraw.min']);
    }
  });

  it('rejects non-integers, missing fields, too many decimals and min above max', () => {
    expect(parseSettingForm('auto_receive_seconds', reader({ auto_receive_seconds: '1.5' })).ok).toBe(false);
    expect(parseSettingForm('expire_minutes', reader({ expire_minutes: '0' })).ok).toBe(false);
    expect(parseSettingForm('usdc_alert_threshold', reader({})).ok).toBe(false);
    expect(parseSettingForm('usdc_alert_threshold', reader({ usdc_alert_threshold: '1.12345678' })).ok).toBe(false);
    const swapped = { ...formOf('fees'), 'fees.ARS.deposit.min': '600000' };
    const result = parseSettingForm('fees', reader(swapped));
    expect(result).toEqual({ ok: false, errors: { 'fees.ARS.deposit.max': expect.any(String) } });
  });
});
