import type { NextRequest } from 'next/server';
import { preflight } from '@/lib/sep24/http';
import { listTransactions } from '@/lib/sep24/routes';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return listTransactions(request);
}

export function OPTIONS() {
  return preflight();
}
