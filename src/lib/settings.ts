import { z } from 'zod';
import { db } from './db';

const limits = z.object({ min: z.string(), max: z.string(), fee_fixed: z.string(), fee_percent: z.string() });
const perAsset = z.object({ deposit: limits, withdraw: limits });

const schemas = {
  /** Same fees and limits as the real anchor publishes in /info. */
  fees: z.object({ ARS: perAsset, PEN: perAsset }),
  /** Units of each asset per 1 USDC, used for DEX offers. */
  rates: z.object({ ARS: z.string(), PEN: z.string(), XLM: z.string(), spread_bps: z.number().int().min(0) }),
  /** Per-account caps for a public sandbox (F8). */
  account_limits: z.object({ ARS: z.object({ daily: z.string() }), PEN: z.object({ daily: z.string() }) }),
  /** 0 disables it; otherwise a deposit is marked received this many seconds after the ticket is shown. */
  auto_receive_seconds: z.number().int().min(0),
  /** Minutes a transaction may wait for the user before it expires. */
  expire_minutes: z.number().int().min(1),
  usdc_alert_threshold: z.string(),
};

export type Settings = { [K in keyof typeof schemas]: z.infer<(typeof schemas)[K]> };
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  fees: {
    ARS: {
      deposit: { min: '11', max: '500000', fee_fixed: '10', fee_percent: '1' },
      withdraw: { min: '11', max: '500000', fee_fixed: '10', fee_percent: '2' },
    },
    PEN: {
      deposit: { min: '2', max: '3000', fee_fixed: '1', fee_percent: '1' },
      withdraw: { min: '2', max: '3000', fee_fixed: '1', fee_percent: '2' },
    },
  },
  rates: { ARS: '1450', PEN: '3.7', XLM: '4', spread_bps: 100 },
  account_limits: { ARS: { daily: '1000000' }, PEN: { daily: '6000' } },
  auto_receive_seconds: 0,
  expire_minutes: 60,
  usdc_alert_threshold: '200',
};

export async function getSettings(): Promise<Settings> {
  const rows = await db().setting.findMany();
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const row of rows) {
    const schema = schemas[row.key as SettingKey];
    const parsed = schema?.safeParse(row.value);
    if (parsed?.success) merged[row.key] = parsed.data;
  }
  return merged as Settings;
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K], updatedBy: string): Promise<void> {
  const data = schemas[key].parse(value);
  await db().setting.upsert({
    where: { key },
    create: { key, value: data, updated_by: updatedBy },
    update: { value: data, updated_by: updatedBy },
  });
}
