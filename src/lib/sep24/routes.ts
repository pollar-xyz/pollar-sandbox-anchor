import type { Prisma, TransactionKind } from '@prisma/client';
import { StrKey } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';
import { fiatAsset, isFiatCode } from '../assets';
import { db } from '../db';
import { interactiveUrl } from '../interactive-token';
import type { Sep10Claims } from '../sep10';
import { authenticate, errorResponse, jsonError, readBody } from './http';
import { serializeTransaction } from './serialize';
import { createTransaction } from './transitions';

/** POST /transfer24/transactions/{deposit|withdraw}/interactive */
export async function startInteractive(request: Request, kind: TransactionKind): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readBody(request);
    const assetCode = body.asset_code ?? '';
    if (!isFiatCode(assetCode)) return jsonError(400, 'asset_code must be ARS or PEN');
    if (body.asset_issuer && body.asset_issuer !== (await fiatAsset(assetCode)).getIssuer()) {
      return jsonError(400, `asset_issuer does not match the ${assetCode} issuer of this anchor`);
    }
    const account = body.account?.trim() || auth.account;
    if (!StrKey.isValidEd25519PublicKey(account)) return jsonError(400, 'account must be a valid Stellar G... address');
    if (account !== auth.account) return jsonError(403, 'account must match the SEP-10 authenticated account');

    const memo = body.memo?.trim() || auth.memo || undefined;
    const memoType = body.memo?.trim() ? body.memo_type?.trim() || 'text' : auth.memo ? 'id' : undefined;
    const tx = await createTransaction({
      kind,
      assetCode,
      account,
      amount: body.amount?.trim() || undefined,
      memo,
      memoType,
      lang: body.lang?.trim() || undefined,
      clientDomain: auth.clientDomain ?? undefined,
    });
    const url = await interactiveUrl({ transactionId: tx.id, account });
    return NextResponse.json({ type: 'interactive_customer_info_needed', url, id: tx.id });
  } catch (err) {
    return errorResponse(err);
  }
}

function ownedBy(auth: Sep10Claims): Prisma.TransactionWhereInput {
  return auth.memo ? { account: auth.account, memo: auth.memo } : { account: auth.account };
}

/** GET /transfer24/transaction */
export async function getTransaction(request: Request): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const stellarId = params.get('stellar_transaction_id');
  const externalId = params.get('external_transaction_id');
  const by: Prisma.TransactionWhereInput | null = id
    ? { id }
    : stellarId
      ? { stellar_transaction_id: stellarId }
      : externalId
        ? { external_transaction_id: externalId }
        : null;
  if (!by) return jsonError(400, 'id, stellar_transaction_id or external_transaction_id is required');
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, 'transaction not found');
  try {
    const tx = await db().transaction.findFirst({ where: { AND: [by, ownedBy(auth)] } });
    if (!tx) return jsonError(404, 'transaction not found');
    return NextResponse.json({ transaction: serializeTransaction(tx) });
  } catch (err) {
    return errorResponse(err);
  }
}

const MAX_LIMIT = 200;

/** GET /transfer24/transactions */
export async function listTransactions(request: Request): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const assetCode = params.get('asset_code') ?? '';
  if (!isFiatCode(assetCode)) return jsonError(400, 'asset_code must be ARS or PEN');

  const where: Prisma.TransactionWhereInput[] = [ownedBy(auth), { asset_code: assetCode }];
  const kind = params.get('kind');
  if (kind) {
    if (kind !== 'deposit' && kind !== 'withdrawal') return jsonError(400, 'kind must be deposit or withdrawal');
    where.push({ kind });
  }
  const noOlderThan = params.get('no_older_than');
  if (noOlderThan) {
    const date = new Date(noOlderThan);
    if (Number.isNaN(date.getTime())) return jsonError(400, 'no_older_than must be an ISO 8601 date');
    where.push({ started_at: { gte: date } });
  }
  const limitParam = params.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : MAX_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) return jsonError(400, 'limit must be a positive integer');

  try {
    const pagingId = params.get('paging_id');
    if (pagingId) {
      const anchor = /^[0-9a-f-]{36}$/i.test(pagingId)
        ? await db().transaction.findFirst({ where: { AND: [{ id: pagingId }, ownedBy(auth)] } })
        : null;
      if (!anchor) return jsonError(400, 'paging_id does not match any of your transactions');
      where.push({
        OR: [{ started_at: { lt: anchor.started_at } }, { started_at: anchor.started_at, id: { lt: anchor.id } }],
      });
    }
    const rows = await db().transaction.findMany({
      where: { AND: where },
      orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
      take: Math.min(limit, MAX_LIMIT),
    });
    return NextResponse.json({ transactions: rows.map(serializeTransaction) });
  } catch (err) {
    return errorResponse(err);
  }
}
