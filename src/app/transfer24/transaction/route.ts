import type { NextRequest } from 'next/server';
import { preflight } from '@/lib/sep24/http';
import { getTransaction } from '@/lib/sep24/routes';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return getTransaction(request);
}

export function OPTIONS() {
  return preflight();
}
