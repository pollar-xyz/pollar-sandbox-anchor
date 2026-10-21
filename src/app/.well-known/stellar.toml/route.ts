import { NextResponse } from 'next/server';
import { CORS_HEADERS, preflight } from '@/lib/sep24/http';
import { buildStellarToml, NotBootstrappedError } from '@/lib/sep24/stellar-toml';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const toml = await buildStellarToml();
    return new NextResponse(toml, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (err) {
    const message =
      err instanceof NotBootstrappedError
        ? `# The sandbox anchor is not bootstrapped yet (${err.message}). Try again later.\n`
        : '# stellar.toml is temporarily unavailable.\n';
    if (!(err instanceof NotBootstrappedError)) console.error('[sep1] stellar.toml failed', err);
    return new NextResponse(message, {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

export function OPTIONS() {
  return preflight();
}
