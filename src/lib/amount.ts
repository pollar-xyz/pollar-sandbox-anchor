// Amounts travel as decimal strings and are computed in stroops (7 decimals) to avoid float drift.
const SCALE = 10_000_000n;

export function toStroops(value: string | number): bigint {
  const s = typeof value === 'number' ? value.toFixed(7) : value.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(s)) throw new Error(`Invalid amount: ${value}`);
  const [int, frac = ''] = s.split('.');
  return BigInt(int) * SCALE + BigInt(frac.padEnd(7, '0'));
}

export function fromStroops(stroops: bigint, decimals = 7): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const factor = 10n ** BigInt(7 - decimals);
  const rounded = (abs + factor / 2n) / factor;
  const unit = 10n ** BigInt(decimals);
  const int = rounded / unit;
  const frac = decimals > 0 ? `.${(rounded % unit).toString().padStart(decimals, '0')}` : '';
  return `${neg ? '-' : ''}${int}${frac}`;
}

export function isValidAmount(value: string): boolean {
  return /^\d+(\.\d{1,7})?$/.test(value.trim()) && toStroops(value) > 0n;
}
