import { NextResponse } from 'next/server';
import { limitByAccount, limitByIp } from '../rate-limit';
import { requireSep10, type Sep10Claims, Sep10Error } from '../sep10';
import { TransitionError, type TransitionErrorCode } from './transitions';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/** SEP-24 clients send either JSON or form-encoded bodies (multipart included). */
export async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? '';
  const out: Record<string, string> = {};
  if (type.includes('application/json')) {
    const body: unknown = await request.json().catch(() => null);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') out[k] = v;
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
      }
    }
    return out;
  }
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    form?.forEach((v, k) => {
      if (typeof v === 'string') out[k] = v;
    });
  }
  return out;
}

const TRANSITION_STATUS: Record<TransitionErrorCode, number> = {
  not_found: 404,
  invalid_state: 409,
  conflict: 409,
  invalid_amount: 400,
  invalid_memo: 400,
  invalid_destination: 400,
  too_small: 400,
  too_large: 400,
  daily_limit: 400,
};

/** Maps thrown errors to the JSON shape clients expect. Missing anchor accounts mean the sandbox is not bootstrapped. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof TransitionError) return jsonError(TRANSITION_STATUS[err.code], err.message, { code: err.code });
  if (err instanceof Sep10Error) return jsonError(err.status, err.message);
  if (err instanceof Error && /is not bootstrapped/.test(err.message)) {
    return jsonError(503, 'The sandbox anchor is not bootstrapped yet. Try again later.');
  }
  console.error('[sep] unexpected error', err);
  return jsonError(500, 'Internal error');
}

/** Rate limits by IP, requires a SEP-10 JWT, then rate limits by account. */
export async function authenticate(request: Request): Promise<Sep10Claims | NextResponse> {
  const byIp = limitByIp(request);
  if (byIp) return byIp;
  const auth = await requireSep10(request);
  if (auth instanceof NextResponse) return auth;
  return limitByAccount(auth.account) ?? auth;
}
