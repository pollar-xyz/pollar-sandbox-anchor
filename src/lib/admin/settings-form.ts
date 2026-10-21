import { DEFAULT_SETTINGS, type SettingKey, type Settings } from '../settings';

// The settings forms are generated from the shape of DEFAULT_SETTINGS: every leaf becomes one input
// named by its dotted path. Numbers in the defaults are integers; strings are decimal amounts.

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

export interface SettingField {
  name: string;
  path: string[];
  kind: 'int' | 'decimal';
  value: string;
  defaultValue: string;
}

export type ParseResult<K extends SettingKey> =
  { ok: true; value: Settings[K] } | { ok: false; errors: Record<string, string> };

const DECIMAL = /^\d+(\.\d{1,7})?$/;
const INT = /^\d+$/;

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as string[]).includes(key);
}

function leaves(value: unknown, path: string[]): { path: string[]; leaf: string | number }[] {
  if (typeof value === 'string' || typeof value === 'number') return [{ path, leaf: value }];
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, [...path, k]));
  }
  return [];
}

function getAt(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    value,
  );
}

/** Fields of one setting, filled with the current value and the default. */
export function settingFields<K extends SettingKey>(key: K, current: Settings[K]): SettingField[] {
  return leaves(DEFAULT_SETTINGS[key], [key]).map(({ path, leaf }) => {
    const currentValue = getAt({ [key]: current }, path);
    return {
      name: path.join('.'),
      path: path.slice(1),
      kind: typeof leaf === 'number' ? 'int' : 'decimal',
      value: String(currentValue ?? leaf),
      defaultValue: String(leaf),
    };
  });
}

/** Rebuilds a setting value from form inputs, validating each leaf. */
export function parseSettingForm<K extends SettingKey>(key: K, read: (name: string) => string | null): ParseResult<K> {
  const errors: Record<string, string> = {};
  const build = (template: unknown, path: string[]): unknown => {
    if (typeof template === 'string' || typeof template === 'number') {
      const name = path.join('.');
      const raw = (read(name) ?? '').trim();
      if (typeof template === 'number') {
        if (!INT.test(raw)) errors[name] = 'Debe ser un entero mayor o igual a 0';
        return Number(raw);
      }
      if (!DECIMAL.test(raw)) errors[name] = 'Debe ser un número positivo con hasta 7 decimales';
      return raw;
    }
    return Object.fromEntries(Object.entries(template as Record<string, unknown>).map(([k, v]) => [k, build(v, [...path, k])]));
  };
  const value = build(DEFAULT_SETTINGS[key], [key]);
  if (key === 'fees') checkFeeRanges(value as Settings['fees'], errors);
  if (key === 'expire_minutes' && value === 0) errors.expire_minutes = 'Debe ser al menos 1';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: value as Settings[K] };
}

function checkFeeRanges(fees: Settings['fees'], errors: Record<string, string>): void {
  for (const [asset, ops] of Object.entries(fees)) {
    for (const [op, l] of Object.entries(ops)) {
      const name = `fees.${asset}.${op}.max`;
      if (!errors[name] && !errors[`fees.${asset}.${op}.min`] && Number(l.min) > Number(l.max)) {
        errors[name] = 'El máximo debe ser mayor o igual al mínimo';
      }
    }
  }
}
