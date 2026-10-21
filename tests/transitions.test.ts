import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Keypair } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings';

// In-memory stand-in for the Prisma client: just the operations and filters transitions.ts uses.
type Row = Record<string, unknown>;
const store = { transactions: [] as Row[], events: [] as Row[] };
const AMOUNT_FIELDS = ['amount_expected', 'amount_in', 'amount_out', 'amount_fee'];
const NULLABLE = [
  'memo',
  'memo_type',
  'lang',
  'client_domain',
  ...AMOUNT_FIELDS,
  'completed_at',
  'user_action_required_by',
  'stellar_transaction_id',
  'external_transaction_id',
  'from',
  'to',
  'message',
  'refunds',
  'deposit_memo',
  'deposit_memo_type',
  'withdraw_anchor_account',
  'withdraw_memo',
  'withdraw_memo_type',
  'external_extra',
  'external_extra_text',
  'destination',
  'forced_outcome',
];

function normalize(data: Row): Row {
  const out: Row = { ...data };
  for (const f of AMOUNT_FIELDS) {
    if (typeof out[f] === 'string') out[f] = new Prisma.Decimal(out[f] as string);
  }
  return out;
}

function value(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v instanceof Prisma.Decimal) return v.toNumber();
  return v;
}

function matches(row: Row, where: Row | undefined): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === 'AND') {
      if (!(cond as Row[]).every((w) => matches(row, w))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    const v = value(row[key]);
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      for (const [op, raw] of Object.entries(cond as Row)) {
        const x = value(raw);
        if (op === 'not' && v === x) return false;
        if (op === 'notIn' && (raw as unknown[]).map(value).includes(v)) return false;
        if (op === 'in' && !(raw as unknown[]).map(value).includes(v)) return false;
        if (op === 'lt' && !(v !== null && v !== undefined && (v as number) < (x as number))) return false;
        if (op === 'gte' && !(v !== null && v !== undefined && (v as number) >= (x as number))) return false;
      }
    } else if (v !== value(cond)) return false;
  }
  return true;
}

const fakeDb = {
  transaction: {
    create: async ({ data }: { data: Row }) => {
      const row: Row = Object.fromEntries(NULLABLE.map((f) => [f, null]));
      Object.assign(row, normalize(data), {
        id: randomUUID(),
        refunded: false,
        started_at: new Date(),
        updated_at: new Date(),
      });
      store.transactions.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: { where: Row }) => {
      const row = store.transactions.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    findUniqueOrThrow: async ({ where }: { where: Row }) => {
      const row = store.transactions.find((r) => matches(r, where));
      if (!row) throw new Error('not found');
      return { ...row };
    },
    findFirst: async ({ where }: { where: Row }) => {
      const row = store.transactions.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    findMany: async ({ where, take }: { where: Row; take?: number }) =>
      store.transactions
        .filter((r) => matches(r, where))
        .slice(0, take)
        .map((r) => ({ ...r })),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = store.transactions.filter((r) => matches(r, where));
      for (const r of rows) Object.assign(r, normalize(data), { updated_at: new Date() });
      return { count: rows.length };
    },
    aggregate: async ({ where }: { where: Row }) => {
      let sum: Prisma.Decimal | null = null;
      for (const r of store.transactions.filter((row) => matches(row, where))) {
        if (r.amount_in) sum = (sum ?? new Prisma.Decimal(0)).plus(r.amount_in as Prisma.Decimal);
      }
      return { _sum: { amount_in: sum } };
    },
  },
  transactionEvent: {
    create: async ({ data }: { data: Row }) => {
      store.events.push({ ...data, created_at: new Date() });
      return data;
    },
  },
  $transaction: async <T>(fn: (client: unknown) => Promise<T>) => fn(fakeDb),
};

const keys = {
  ISSUER_ARS: Keypair.random().publicKey(),
  ISSUER_PEN: Keypair.random().publicKey(),
  WITHDRAW: Keypair.random().publicKey(),
  DISTRIBUTION: Keypair.random().publicKey(),
};
let settings: Settings;
const sendPayment = vi.fn();
const horizonTx = vi.fn();

vi.mock('@/lib/db', () => ({ db: () => fakeDb }));
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  getSettings: async () => settings,
}));
vi.mock('@/lib/accounts', () => ({
  requireActiveAccount: async (role: keyof typeof keys) => ({ role, public_key: keys[role] }),
  getActiveAccount: async (role: keyof typeof keys) => ({ role, public_key: keys[role] }),
  activeKeypair: async () => Keypair.random(),
}));
vi.mock('@/lib/payments', () => ({ sendPayment: (...args: unknown[]) => sendPayment(...args) }));
vi.mock('@/lib/stellar', () => ({
  horizon: () => ({ transactions: () => ({ transaction: (hash: string) => ({ call: () => horizonTx(hash) }) }) }),
}));

const t = await import('@/lib/sep24/transitions');
const { toIncomingPayment } = await import('@/lib/jobs/watcher');
const { sweepOnce } = await import('@/lib/jobs/sweeper');

const USER = Keypair.random().publicKey();

function eventsOf(id: string): string[] {
  return store.events.filter((e) => e.transaction_id === id).map((e) => `${e.from_status ?? '-'}>${e.to_status}`);
}

function age(id: string, field: 'started_at' | 'updated_at' | 'user_action_required_by', minutes: number) {
  const row = store.transactions.find((r) => r.id === id)!;
  row[field] = new Date(Date.now() - minutes * 60_000);
}

beforeEach(() => {
  store.transactions.length = 0;
  store.events.length = 0;
  settings = structuredClone(DEFAULT_SETTINGS);
  sendPayment.mockReset();
  sendPayment.mockResolvedValue('stellar-hash-1');
  horizonTx.mockReset();
});

describe('deposit', () => {
  it('runs incomplete -> ticket -> received -> paid on-chain -> completed', async () => {
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    expect(created.status).toBe('incomplete');

    const ticket = await t.submitDepositAmount(created.id, '200');
    expect(ticket.status).toBe('pending_user_transfer_start');
    expect([ticket.amount_in?.toFixed(2), ticket.amount_fee?.toFixed(2), ticket.amount_out?.toFixed(2)]).toEqual([
      '200.00',
      '12.00',
      '188.00',
    ]);
    const [cbu, alias, holder, bank] = ticket.external_extra!.split('|');
    expect(cbu).toMatch(/^\d{22}$/);
    expect([alias, holder, bank]).toEqual(['ARS.SANDBOX.POLLAR', 'POLLAR SANDBOX SA', 'Banco Sandbox']);
    expect(ticket.external_extra).toBe(t.depositTicket(created.id, 'ARS', '200').externalExtra);
    expect(ticket.external_extra_text).toContain(`CBU: ${cbu}`);
    expect(ticket.external_extra_text).toContain('$ 200.00');
    expect(ticket.user_action_required_by!.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    expect(ticket.forced_outcome).toBeNull();

    const done = await t.markDepositReceived(created.id, 'user');
    expect(done.status).toBe('completed');
    expect(done.stellar_transaction_id).toBe('stellar-hash-1');
    expect(done.completed_at).toBeInstanceOf(Date);
    expect(done.external_transaction_id).toMatch(/^DEP-\d{12}$/);
    const payment = sendPayment.mock.calls[0][0];
    expect(payment.to).toBe(USER);
    expect(payment.amount).toBe('188.0000000');
    expect(payment.asset.getCode()).toBe('ARS');
    expect(payment.asset.getIssuer()).toBe(keys.ISSUER_ARS);
    expect(payment.memo).toBeUndefined();
    expect(eventsOf(created.id)).toEqual([
      '->incomplete',
      'incomplete>pending_user_transfer_start',
      'pending_user_transfer_start>pending_anchor',
      'pending_anchor>completed',
    ]);
  });

  it('uses a 20-digit CCI for PEN and pays with the deposit memo', async () => {
    const created = await t.createTransaction({
      kind: 'deposit',
      assetCode: 'PEN',
      account: USER,
      memo: 'hello',
      memoType: 'text',
    });
    const ticket = await t.submitDepositAmount(created.id, '100');
    expect(ticket.external_extra!.split('|')[0]).toMatch(/^\d{20}$/);
    expect(ticket.external_extra_text).toContain('CCI');
    const done = await t.markDepositReceived(created.id, 'system');
    expect(sendPayment.mock.calls[0][0].memo.value.toString()).toBe('hello');
    expect([done.deposit_memo, done.deposit_memo_type]).toEqual(['hello', 'text']);
  });

  it('stores amount_expected and rejects malformed memos at creation', async () => {
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER, amount: '150' });
    expect(created.amount_expected?.toFixed(2)).toBe('150.00');
    await expect(
      t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER, memo: 'x', memoType: 'id' }),
    ).rejects.toMatchObject({ code: 'invalid_memo' });
  });

  it('rejects amounts outside the limits without failing the transaction', async () => {
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await expect(t.submitDepositAmount(created.id, '5')).rejects.toMatchObject({
      code: 'too_small',
      message: 'Ingrese un monto entre 11.00 y 500000.00',
    });
    await expect(t.submitDepositAmount(created.id, '600000')).rejects.toMatchObject({ code: 'too_large' });
    await expect(t.submitDepositAmount(created.id, '20.123')).rejects.toMatchObject({ code: 'invalid_amount' });
    expect(store.transactions[0].status).toBe('incomplete');
  });

  it('enforces the per-account daily cap across transactions', async () => {
    settings.account_limits.ARS.daily = '300';
    const first = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await t.submitDepositAmount(first.id, '200');
    const second = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await expect(t.submitDepositAmount(second.id, '150')).rejects.toMatchObject({ code: 'daily_limit' });
    await t.failTransaction(first.id, 'error', 'test', 'system');
    expect((await t.submitDepositAmount(second.id, '150')).status).toBe('pending_user_transfer_start');
  });

  it.each([
    ['66.60', 'refunded'],
    ['13.13', 'error'],
    ['77.70', 'expired'],
    ['11.11', 'too_small'],
    ['55.55', 'no_market'],
  ])('magic amount %s ends in %s without paying', async (amount, status) => {
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    const ticket = await t.submitDepositAmount(created.id, amount);
    expect(ticket.forced_outcome).toBe(status);
    const done = await t.markDepositReceived(created.id, 'user');
    expect(done.status).toBe(status);
    expect(done.message).toContain(`magic amount ${amount}`);
    expect(sendPayment).not.toHaveBeenCalled();
    if (status === 'refunded') {
      expect(done.refunded).toBe(true);
      expect(done.refunds).toMatchObject({ amount_refunded: amount, payments: [{ id_type: 'external', amount }] });
    }
  });

  it('ends in error with a clear message when the account has no trustline', async () => {
    sendPayment.mockRejectedValue({
      response: { data: { extras: { result_codes: { transaction: 'tx_failed', operations: ['op_no_trust'] } } } },
    });
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await t.submitDepositAmount(created.id, '200');
    const done = await t.markDepositReceived(created.id, 'user');
    expect(done.status).toBe('error');
    expect(done.message).toBe(`the account has no trustline to ARS:${keys.ISSUER_ARS}`);
    expect(eventsOf(created.id).slice(-2)).toEqual(['pending_user_transfer_start>pending_anchor', 'pending_anchor>error']);
  });

  it('only receives a deposit once', async () => {
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await t.submitDepositAmount(created.id, '200');
    await t.markDepositReceived(created.id, 'user');
    await expect(t.markDepositReceived(created.id, 'user')).rejects.toMatchObject({ code: 'invalid_state' });
    expect(sendPayment).toHaveBeenCalledTimes(1);
  });
});

const CBU = '0110599520000001234567';

async function pendingWithdrawal(amount = '200') {
  const created = await t.createTransaction({ kind: 'withdrawal', assetCode: 'ARS', account: USER });
  return t.submitWithdrawDetails(created.id, { amount, destination: { holder: 'Ana', bankAccount: CBU } });
}

function paymentFor(
  tx: { withdraw_memo: string | null },
  overrides: Partial<import('@/lib/sep24/transitions').IncomingPayment> = {},
) {
  return {
    txHash: 'hash-' + randomUUID(),
    from: USER,
    assetCode: 'ARS',
    assetIssuer: keys.ISSUER_ARS,
    amount: '200.0000000',
    memo: tx.withdraw_memo,
    memoType: 'hash',
    ...overrides,
  };
}

describe('withdrawal', () => {
  it('assigns the withdraw account and a 32-byte hash memo only after the form', async () => {
    const created = await t.createTransaction({ kind: 'withdrawal', assetCode: 'ARS', account: USER });
    expect(created.withdraw_anchor_account).toBeNull();
    expect(created.withdraw_memo).toBeNull();

    const tx = await t.submitWithdrawDetails(created.id, { amount: '1000', destination: { holder: 'Ana', bankAccount: CBU } });
    expect(tx.status).toBe('pending_user_transfer_start');
    expect(tx.withdraw_anchor_account).toBe(keys.WITHDRAW);
    expect(tx.withdraw_memo_type).toBe('hash');
    expect(Buffer.from(tx.withdraw_memo!, 'base64')).toHaveLength(32);
    expect(tx.to).toBe(CBU);
    expect(tx.amount_fee?.toFixed(2)).toBe('30.00');
    expect(tx.destination).toEqual({ holder: 'Ana', bankAccount: CBU });
  });

  it('validates the bank account', async () => {
    const created = await t.createTransaction({ kind: 'withdrawal', assetCode: 'PEN', account: USER });
    await expect(
      t.submitWithdrawDetails(created.id, { amount: '100', destination: { holder: 'Ana', bankAccount: CBU } }),
    ).rejects.toMatchObject({ code: 'invalid_destination', message: 'El CCI debe tener 20 digitos' });
  });

  it('matches the payment by hash memo and completes, idempotently', async () => {
    const pending = await pendingWithdrawal();
    const payment = paymentFor(pending);
    const done = await t.handleWithdrawPayment(payment);
    expect(done?.id).toBe(pending.id);
    expect(done?.status).toBe('completed');
    expect(done?.from).toBe(USER);
    expect(done?.stellar_transaction_id).toBe(payment.txHash);
    expect(done?.external_transaction_id).toMatch(/^WDR-\d{12}$/);
    expect(eventsOf(pending.id).slice(-2)).toEqual(['pending_user_transfer_start>pending_anchor', 'pending_anchor>completed']);

    const events = store.events.length;
    expect((await t.handleWithdrawPayment(payment))?.status).toBe('completed');
    expect(store.events.length).toBe(events);
  });

  it('accepts the memo in hex and ignores payments without a matching hash memo', async () => {
    const pending = await pendingWithdrawal();
    expect(await t.handleWithdrawPayment(paymentFor(pending, { memoType: 'text', memo: 'hi' }))).toBeNull();
    expect(await t.handleWithdrawPayment(paymentFor(pending, { memo: Buffer.alloc(32, 7).toString('base64') }))).toBeNull();
    const hex = Buffer.from(pending.withdraw_memo!, 'base64').toString('hex');
    expect((await t.handleWithdrawPayment(paymentFor(pending, { memo: hex })))?.status).toBe('completed');
  });

  it('fails when the payment is short or in the wrong asset', async () => {
    const short = await pendingWithdrawal();
    const shortDone = await t.handleWithdrawPayment(paymentFor(short, { amount: '150' }));
    expect(shortDone?.status).toBe('error');
    expect(shortDone?.message).toBe('Received 150.00 ARS, expected at least 200.00 ARS.');

    const wrong = await pendingWithdrawal();
    const wrongDone = await t.handleWithdrawPayment(paymentFor(wrong, { assetIssuer: Keypair.random().publicKey() }));
    expect(wrongDone?.status).toBe('error');
    expect(wrongDone?.stellar_transaction_id).toBeTruthy();
  });

  it('applies the magic refund once the payment arrives', async () => {
    const pending = await pendingWithdrawal('66.60');
    const payment = paymentFor(pending, { amount: '66.60' });
    const done = await t.handleWithdrawPayment(payment);
    expect(done?.status).toBe('refunded');
    expect(done?.refunds).toMatchObject({ payments: [{ id: payment.txHash, id_type: 'stellar', amount: '66.60' }] });
  });
});

describe('admin and housekeeping', () => {
  it('failTransaction refuses terminal transactions; forceStatus overrides anything', async () => {
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await t.failTransaction(created.id, 'no_market', 'closed', 'admin:ops@pollar.xyz');
    await expect(t.failTransaction(created.id, 'error', 'again', 'system')).rejects.toMatchObject({ code: 'invalid_state' });

    const forced = await t.forceStatus(created.id, 'completed', 'admin:ops@pollar.xyz', 'support ticket 42');
    expect(forced.status).toBe('completed');
    expect(forced.completed_at).toBeInstanceOf(Date);
    expect(store.events.at(-1)).toMatchObject({
      actor: 'admin:ops@pollar.xyz',
      note: 'support ticket 42',
      to_status: 'completed',
    });
    await expect(t.forceStatus(created.id, 'bogus', 'system')).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('expireStale expires old incomplete and unpaid tickets only', async () => {
    const old = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    age(old.id, 'started_at', 61);
    const fresh = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    const ticket = await pendingWithdrawal();
    age(ticket.id, 'user_action_required_by', 1);

    expect(await t.expireStale()).toBe(2);
    expect(store.transactions.find((r) => r.id === old.id)?.status).toBe('expired');
    expect(store.transactions.find((r) => r.id === ticket.id)?.status).toBe('expired');
    expect(store.transactions.find((r) => r.id === fresh.id)?.status).toBe('incomplete');
  });

  it('auto-receives deposits once auto_receive_seconds have passed', async () => {
    settings.auto_receive_seconds = 30;
    const created = await t.createTransaction({ kind: 'deposit', assetCode: 'ARS', account: USER });
    await t.submitDepositAmount(created.id, '200');
    expect(await sweepOnce()).toEqual({ expired: 0, received: 0 });
    age(created.id, 'updated_at', 1);
    expect(await sweepOnce()).toEqual({ expired: 0, received: 1 });
    expect(store.transactions[0].status).toBe('completed');
  });
});

describe('watcher record mapping', () => {
  const account = keys.WITHDRAW;
  const base = {
    paging_token: '1',
    type: 'payment',
    transaction_hash: 'abc',
    transaction_successful: true,
    from: USER,
    to: account,
    amount: '200.0000000',
    asset_type: 'credit_alphanum4',
    asset_code: 'ARS',
    asset_issuer: keys.ISSUER_ARS,
  };

  it('uses the joined transaction memo', async () => {
    const memo = Buffer.alloc(32, 1).toString('base64');
    expect(await toIncomingPayment({ ...base, transaction_attr: { memo, memo_type: 'hash' } }, account)).toEqual({
      txHash: 'abc',
      from: USER,
      assetCode: 'ARS',
      assetIssuer: keys.ISSUER_ARS,
      amount: '200.0000000',
      memo,
      memoType: 'hash',
    });
  });

  it('fetches the transaction when it was not joined, and skips outgoing or failed payments', async () => {
    horizonTx.mockResolvedValue({ memo: 'bWVtbw==', memo_type: 'hash' });
    expect((await toIncomingPayment(base, account))?.memo).toBe('bWVtbw==');
    expect(await toIncomingPayment({ ...base, to: USER }, account)).toBeNull();
    expect(await toIncomingPayment({ ...base, transaction_successful: false }, account)).toBeNull();
    expect(await toIncomingPayment({ ...base, type: 'create_account' }, account)).toBeNull();
  });
});
