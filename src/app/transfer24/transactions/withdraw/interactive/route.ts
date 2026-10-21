import type { NextRequest } from 'next/server';
import { preflight } from '@/lib/sep24/http';
import { startInteractive } from '@/lib/sep24/routes';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return startInteractive(request, 'withdrawal');
}

export function OPTIONS() {
  return preflight();
}
