import { isValidAmount } from '@/lib/amount';

// Kept apart from format.ts so client components can import it without pulling server-only modules.

/**
 * Accepts what a user types in an es-AR / es-PE amount box: "200", "200,5", "200.50", "$ 1.5", "S/ 20".
 * A single comma or dot is the decimal separator. Returns a canonical decimal string or null.
 */
export function normalizeAmountInput(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^(S\/|\$)/, '')
    .trim()
    .replace(',', '.');
  if (!/^\d+(\.\d{0,7})?$/.test(cleaned)) return null;
  const canonical = cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned;
  return isValidAmount(canonical) ? canonical : null;
}
