import { z } from 'zod';
import { db } from './db';

const limits = z.object({ min: z.string(), max: z.string(), fee_fixed: z.string(), fee_percent: z.string() });
const perAsset = z.object({ deposit: limits, withdraw: limits });

const schemas = {
  /** Same fees and limits as the real anchor publishes in /info. */
  fees: z.object({ ARS: perAsset, PEN: perAsset, COP: perAsset }),
  /** Units of each asset per 1 USDC, used for DEX offers. */
  rates: z.object({
    ARS: z.string(),
    PEN: z.string(),
    COP: z.string(),
    XLM: z.string(),
    spread_bps: z.number().int().min(0),
  }),
  /** Per-account caps for a public sandbox (F8). */
  account_limits: z.object({
    ARS: z.object({ daily: z.string() }),
    PEN: z.object({ daily: z.string() }),
    COP: z.object({ daily: z.string() }),
  }),
  /** 0 disables it; otherwise a deposit is marked received this many seconds after the ticket is shown. */
  auto_receive_seconds: z.number().int().min(0),
  /** Minutes a transaction may wait for the user before it expires. */
  expire_minutes: z.number().int().min(1),
  usdc_alert_threshold: z.string(),
  /** Most USDC one DEX offer may sell. Bounds what the free fiat tokens can take out between republishes. */
  max_usdc_per_offer: z.string(),
};

export type Settings = { [K in keyof typeof schemas]: z.infer<(typeof schemas)[K]> };
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  fees: {
    // 1 to 10 USD per operation at the default rates: the tokens are free, so a larger deposit only buys more of
    // the anchor's USDC on the DEX.
    ARS: {
      deposit: { min: '1450', max: '14500', fee_fixed: '145', fee_percent: '1' },
      withdraw: { min: '1450', max: '14500', fee_fixed: '145', fee_percent: '2' },
    },
    PEN: {
      deposit: { min: '3.7', max: '37', fee_fixed: '0.37', fee_percent: '1' },
      withdraw: { min: '3.7', max: '37', fee_fixed: '0.37', fee_percent: '2' },
    },
    COP: {
      deposit: { min: '4000', max: '40000', fee_fixed: '400', fee_percent: '1' },
      withdraw: { min: '4000', max: '40000', fee_fixed: '400', fee_percent: '2' },
    },
  },
  rates: { ARS: '1450', PEN: '3.7', COP: '4000', XLM: '4', spread_bps: 100 },
  account_limits: { ARS: { daily: '72500' }, PEN: { daily: '185' }, COP: { daily: '200000' } },
  auto_receive_seconds: 0,
  expire_minutes: 60,
  usdc_alert_threshold: '200',
  max_usdc_per_offer: '20',
};

export async function getSettings(): Promise<Settings> {
  const rows = await db().setting.findMany();
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const row of rows) {
    const key = row.key as SettingKey;
    const schema = schemas[key];
    const parsed = schema?.safeParse(withDefaults(DEFAULT_SETTINGS[key], row.value));
    if (parsed?.success) merged[row.key] = parsed.data;
  }
  return merged as Settings;
}

/**
 * A row saved before an asset existed lacks that asset's entry; the default fills it in instead of the whole
 * row failing validation and every saved value falling back to its default.
 */
function withDefaults(fallback: unknown, value: unknown): unknown {
  if (!isRecord(fallback) || !isRecord(value)) return value;
  return { ...fallback, ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K], updatedBy: string): Promise<void> {
  const data = schemas[key].parse(value);
  await db().setting.upsert({
    where: { key },
    create: { key, value: data, updated_by: updatedBy },
    update: { value: data, updated_by: updatedBy },
  });
}
