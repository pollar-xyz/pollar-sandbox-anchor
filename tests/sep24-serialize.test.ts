import { Prisma, type Transaction } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { formatAmount, serializeTransaction } from '@/lib/sep24/serialize';

vi.mock('@/lib/stellar', () => ({ publicUrl: (path = '') => `https://sandbox-anchor.example.org${path}` }));

function row(overrides: Partial<Transaction>): Transaction {
  return {
    id: '7a0b6f6e-4a39-4c4b-9a1f-1d2b3c4d5e6f',
    kind: 'deposit',
    status: 'incomplete',
    asset_code: 'ARS',
    account: 'GABC',
    memo: null,
    memo_type: null,
    lang: null,
    client_domain: null,
    amount_expected: null,
    amount_in: null,
    amount_out: null,
    amount_fee: null,
    started_at: new Date('2026-10-20T12:00:00.000Z'),
    updated_at: new Date('2026-10-20T12:00:00.000Z'),
    completed_at: null,
    user_action_required_by: null,
    stellar_transaction_id: null,
    external_transaction_id: null,
    from: null,
    to: null,
    message: null,
    refunded: false,
    refunds: null,
    deposit_memo: null,
    deposit_memo_type: null,
    withdraw_anchor_account: null,
    withdraw_memo: null,
    withdraw_memo_type: null,
    external_extra: null,
    external_extra_text: null,
    destination: null,
    forced_outcome: null,
    ...overrides,
  };
}

describe('formatAmount', () => {
  it('prints 2 decimals or null', () => {
    expect(formatAmount(new Prisma.Decimal('200'))).toBe('200.00');
    expect(formatAmount(new Prisma.Decimal('0.0000001'))).toBe('0.00');
    expect(formatAmount(new Prisma.Decimal('188.005'))).toBe('188.01');
    expect(formatAmount(null)).toBeNull();
  });
});

describe('serializeTransaction', () => {
  it('maps a completed deposit like the real anchor, omitting unknown fields', () => {
    const out = serializeTransaction(
      row({
        status: 'completed',
        amount_in: new Prisma.Decimal('200'),
        amount_fee: new Prisma.Decimal('12'),
        amount_out: new Prisma.Decimal('188'),
        completed_at: new Date('2026-10-20T12:05:00.000Z'),
        stellar_transaction_id: 'abc',
        external_transaction_id: 'DEP-1',
        to: 'GABC',
        external_extra: '1234|ARS.SANDBOX.POLLAR|POLLAR SANDBOX SA|Banco Sandbox',
        external_extra_text: 'Transferi...',
      }),
    );
    expect(out).toEqual({
      id: '7a0b6f6e-4a39-4c4b-9a1f-1d2b3c4d5e6f',
      kind: 'deposit',
      status: 'completed',
      status_eta: 3600,
      more_info_url: 'https://sandbox-anchor.example.org/transfer24/transaction/more_info/7a0b6f6e-4a39-4c4b-9a1f-1d2b3c4d5e6f',
      amount_in: '200.00',
      amount_out: '188.00',
      amount_fee: '12.00',
      started_at: '2026-10-20T12:00:00.000Z',
      completed_at: '2026-10-20T12:05:00.000Z',
      stellar_transaction_id: 'abc',
      external_transaction_id: 'DEP-1',
      refunded: false,
      to: 'GABC',
      external_extra: '1234|ARS.SANDBOX.POLLAR|POLLAR SANDBOX SA|Banco Sandbox',
      external_extra_text: 'Transferi...',
    });
  });

  it('hides withdraw_* until they are assigned', () => {
    const fresh = serializeTransaction(row({ kind: 'withdrawal' }));
    expect(fresh).not.toHaveProperty('withdraw_anchor_account');
    expect(fresh).not.toHaveProperty('withdraw_memo');
    expect(fresh).not.toHaveProperty('external_extra');
    expect(fresh.kind).toBe('withdrawal');

    const assigned = serializeTransaction(
      row({
        kind: 'withdrawal',
        status: 'pending_user_transfer_start',
        withdraw_anchor_account: 'GWITHDRAW',
        withdraw_memo: 'bWVtbw==',
        withdraw_memo_type: 'hash',
        user_action_required_by: new Date('2026-10-20T13:00:00.000Z'),
      }),
    );
    expect(assigned).toMatchObject({
      withdraw_anchor_account: 'GWITHDRAW',
      withdraw_memo: 'bWVtbw==',
      withdraw_memo_type: 'hash',
      user_action_required_by: '2026-10-20T13:00:00.000Z',
    });
  });

  it('includes refunds when the transaction was refunded', () => {
    const refunds = {
      amount_refunded: '66.60',
      amount_fee: '0.00',
      payments: [{ id: 'x', id_type: 'external', amount: '66.60', fee: '0.00' }],
    };
    const out = serializeTransaction(row({ status: 'refunded', refunded: true, refunds }));
    expect(out.refunded).toBe(true);
    expect(out.refunds).toEqual(refunds);
  });
});
